const path = require('path');
const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ExtendedDefinePlugin = require('extended-define-webpack-plugin');
const WebpackSplitByPath = require('webpack-split-by-path');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const {AngularCompilerPlugin, PLATFORM} = require('@ngtools/webpack');
const {PurifyPlugin} = require('@angular-devkit/build-optimizer');
const ProgressPlugin = require('webpack/lib/ProgressPlugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const autoprefixer = require('autoprefixer');
const postcssUrl = require('postcss-url');
const cssnano = require('cssnano');
const customProperties = require('postcss-custom-properties');

// tslint:disable:no-var-requires
const packageJSON = require(path.join(process.cwd(), "package.json"));
// tslint:enable:no-var-requires

const postCssPlugins = () => {
    // safe settings based on: https://github.com/ben-eb/cssnano/issues/358#issuecomment-283696193
    const importantCommentRe = /@preserve|@license|[@#]\s*source(?:Mapping)?URL|^!/i;
    const minimizeOptions = {
        compatibility: 'ie10',
        zindex: false,
        autoprefixer: false,
        safe: true,
        mergeLonghand: false,
        discardComments: {
            remove: (comment) => !importantCommentRe.test(comment),
        },
    };

    return [
        postcssUrl(),
        autoprefixer({
            browsers: [
                // TODO keep only Chrome for Electron
                'last 2 versions',
                'Chrome >= 40',
                'Firefox >= 31.8',
                'Explorer >= 10',
                'iOS >= 6.1',
                'Android >= 4'
            ],
        }),
        customProperties({preserve: true}),
        cssnano(minimizeOptions),
    ];
};

const rootContext = process.cwd();
const context = path.resolve(__dirname);
const rootConfig = require(path.join(rootContext, 'webpack.config.js'));

const envs = {
    production: 'production',
    development: 'development',
    test: 'test',
};

const metadata = {
    devHost: process.env.HOST || 'localhost',
    devPort: process.env.PORT || 3000,
    env: {
        value: process.env.NODE_ENV || envs.development,
        isProduction() {
            return this.value === envs.production;
        },
        isDevelopment() {
            return this.value === envs.development;
        },
        isTest() {
            return this.value === envs.test;
        },
    },
    assetsOutputFormat: '[name].[hash].[ext]',
    paths: {
        src: path.resolve(context, './src'),
        app: path.resolve(context, './src/app/'),
        output: path.resolve(rootContext, './app/web/'),
        tsConfig: path.resolve(context, './tsconfig.json'),
    }
};

metadata.sourceMap = true; // !metadata.env.isProduction();

console.log(`metadata: ${JSON.stringify(metadata, null, 4)}`);

if (!(metadata.env.value in envs)) {
    throw new Error('"NODE_ENV" is not defined');
}

const config = {
    common: {
        node: {
            __dirname: false,
            __filename: false,
        },
        target: 'electron-renderer',
        entry: {
            app: [
                ...(!metadata.env.isProduction() ? ['core-js/es7/reflect'] : []),
                path.join(metadata.paths.src, 'index.ts'),
            ],
        },
        output: {
            path: metadata.paths.output,
            filename: `[name].js`,
        },
        resolve: {
            extensions: ['*', '.js', '.ts'],
            alias: {
                ...rootConfig.resolve.alias,
            }
        },
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: ExtractTextPlugin.extract({
                        fallback: 'style-loader',
                        use: [
                            'css-loader',
                            {
                                loader: 'postcss-loader',
                                options: {
                                    sourceMap: metadata.sourceMap,
                                    ident: 'postcss',
                                    plugins: postCssPlugins
                                }
                            },
                        ]
                    }),
                },
                // scss: vendor
                {
                    test: /\.scss$/,
                    use: ExtractTextPlugin.extract({
                        fallback: 'style-loader',
                        use: [
                            'css-loader',
                            {
                                loader: 'postcss-loader',
                                options: {
                                    sourceMap: metadata.sourceMap,
                                    ident: 'postcss',
                                    plugins: postCssPlugins
                                }
                            },
                            'sass-loader',
                        ]
                    }),
                    exclude: [
                        metadata.paths.app
                    ]
                },
                // scss: app
                {
                    test: /\.scss$/,
                    use: [
                        'to-string-loader',
                        {
                            loader: 'css-loader',
                            options: {
                                sourceMap: metadata.sourceMap,
                                importLoaders: 1
                            }
                        },
                        {
                            loader: 'postcss-loader',
                            options: {
                                sourceMap: metadata.sourceMap,
                                ident: 'postcss',
                                plugins: postCssPlugins
                            }
                        },
                        'resolve-url-loader',
                        {
                            loader: 'sass-loader',
                            options: {
                                sourceMap: metadata.sourceMap,
                                precision: 8,
                                includePaths: []
                            }
                        }
                    ],
                    include: [
                        metadata.paths.app
                    ],
                },
                {
                    'test': /\.html$/,
                    'loader': 'raw-loader'
                },
                {
                    test: /\.(ico|gif|png|jpe?g|svg)$/i,
                    use: {
                        loader: 'url-loader',
                        options: {
                            limit: 4096,
                            name: `images/${metadata.assetsOutputFormat}`
                        }
                    }
                },
                {
                    test: /\.(eot|ttf|otf|woff|woff2|svg)$/,
                    use: {
                        loader: 'url-loader',
                        options: {
                            limit: 4096,
                            name: `fonts/${metadata.assetsOutputFormat}`
                        }
                    }
                }
            ]
        },
        plugins: [
            new ExtractTextPlugin({
                filename: `[name].css`,
                disable: false,
                allChunks: true
            }),
            new WebpackSplitByPath([
                {
                    name: 'vendor',
                    path: [
                        path.join(metadata.paths.src, 'vendor'),
                        path.resolve(rootContext, 'node_modules')
                    ]
                },
                // {
                //     name: 'app-shared-module',
                //     path: [
                //         path.join(metadata.paths.app, './+shared'),
                //     ]
                // }
            ]),
            new ExtendedDefinePlugin({
                APP_CONSTANTS: {
                    appName: packageJSON.name,
                    isDevEnv: metadata.env.isDevelopment(),
                }
            }),
            new webpack.EnvironmentPlugin({
                NODE_ENV: metadata.env.value,
            }),
            new HtmlWebpackPlugin({
                template: path.join(metadata.paths.src, 'index.ejs'),
                filename: 'index.html',
                hash: metadata.env.isProduction(),
                minify: false,
            }),
            new CircularDependencyPlugin({
                exclude: /([\\\/])node_modules([\\\/])/,
                failOnError: true,
            }),
            new AngularCompilerPlugin({
                sourceMap: metadata.sourceMap,
                tsConfigPath: metadata.paths.tsConfig,
                entryModule: `${path.join(metadata.paths.src, 'app/app.module')}#AppModule`,
                platform: PLATFORM.Browser,
                compilerOptions: {},
                // prefer JIT over AOT in dev mode
                skipCodeGeneration: metadata.env.isDevelopment(),
            }),
        ],
    },

    development: {
        devtool: 'inline-source-map',
        devServer: {
            port: metadata.devPort,
            host: metadata.devHost,
            hot: true,
            inline: true,
            stats: 'minimal',
            clientLogLevel: 'error',
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: '@ngtools/webpack',
                }
            ],
        },
        plugins: [
            new webpack.HotModuleReplacementPlugin(),
            // new webpack.NamedModulesPlugin(),
        ]
    },

    production: {
        ...(metadata.sourceMap ? {devtool: 'source-map'} : {}),
        module: {
            rules: [
                {
                    test: /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/,
                    use: [
                        {
                            loader: '@angular-devkit/build-optimizer/webpack-loader',
                            options: {
                                sourceMap: metadata.sourceMap,
                            }
                        },
                        '@ngtools/webpack'
                    ]
                },
                {
                    test: /\.js$/,
                    use: [
                        {
                            loader: '@angular-devkit/build-optimizer/webpack-loader',
                            options: {
                                sourceMap: metadata.sourceMap,
                            }
                        }
                    ]
                },
            ]
        },
        plugins: [
            ...(process.env.CI ? [] : [new ProgressPlugin()]),
            new PurifyPlugin(),
            new webpack.HashedModuleIdsPlugin({
                hashFunction: 'md5',
                hashDigest: 'base64',
                hashDigestLength: 4
            }),
            new webpack.LoaderOptionsPlugin({
                minimize: true
            }),
            new UglifyJsPlugin({
                sourceMap: metadata.sourceMap,
                test: /\.js$/i,
                extractComments: false,
                cache: false,
                parallel: false,
                uglifyOptions: {
                    output: {
                        ascii_only: true,
                        comments: false
                    },
                    ecma: 5,
                    warnings: false,
                    ie8: false,
                    mangle: false, // https://github.com/mishoo/UglifyJS2/issues/2664
                    compress: {
                        pure_getters: true,
                        passes: 3
                    }
                }
            }),
            new webpack.NoEmitOnErrorsPlugin(),
        ]
    },

    test: {
        // devtool: 'inline-source-map',
    },
};

const result = webpackMerge(config.common, config[metadata.env.value]);

module.exports = result;
