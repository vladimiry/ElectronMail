// TODO get rid of webpack for the electron building on resolving https://github.com/Microsoft/TypeScript/issues/15479

const path = require('path');
const webpack = require('webpack');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const {TsConfigPathsPlugin} = require('awesome-typescript-loader');

module.exports.generateConfig = ({context}) => {
    const rootContext = process.cwd();
    const rootConfig = require(path.join(rootContext, 'webpack.config.js'));
    const tsConfigPath = path.join(context, "./tsconfig.json");

    const envs = {
        production: 'production',
        development: 'development',
        test: 'test',
    };

    const metadata = {
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
        paths: {
            context,
            rootContext,
            tsConfig: tsConfigPath,
        }
    };

    metadata.sourceMap = true; // !metadata.env.isProduction();

    console.log(`metadata: ${JSON.stringify(metadata, null, 4)}`);

    if (!(metadata.env.value in envs)) {
        throw new Error('"NODE_ENV" is not defined');
    }

    const config = {
        node: {
            __dirname: false,
            __filename: false,
        },
        output: {
            filename: `[name].js`,
            path: path.resolve(metadata.paths.rootContext, './app/electron'),
        },
        resolve: {
            extensions: ['*', '.js', '.ts'],
            alias: {
                ...rootConfig.resolve.alias,
            },
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: [
                        {
                            loader: 'awesome-typescript-loader',
                            options: {
                                configFileName: metadata.paths.tsConfig,
                            }
                        }
                    ],
                    exclude: /node_modules/
                }
            ]
        },
        plugins: [
            new TsConfigPathsPlugin({configFileName: metadata.paths.tsConfig}),
            new CircularDependencyPlugin({
                exclude: /node_modules/,
                failOnError: true,
            }),
            new webpack.NoEmitOnErrorsPlugin(),
            // https://github.com/webpack/webpack/issues/1599#issuecomment-328927602
            {
                apply(compiler) {
                    function setModuleConstant(expression, fn) {
                        compiler.plugin('parser', function (parser) {
                            parser.plugin(`expression ${ expression }`, function () {
                                this.state.current.addVariable(expression, JSON.stringify(fn(this.state.module)));
                                return true
                            })
                        })
                    }

                    setModuleConstant('__filename', function (module) {
                        return module.resource
                    });

                    setModuleConstant('__dirname', function (module) {
                        return module.context
                    });
                }
            },
        ],
        ...(metadata.sourceMap ? {devtool: 'source-map'} : {}),
    };

    return {metadata, config};
};
