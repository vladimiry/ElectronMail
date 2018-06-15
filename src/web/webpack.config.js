// tslint:disable:object-literal-sort-keys

// const {SourceMapDevToolPlugin} = require("webpack");
const autoprefixer = require("autoprefixer");
const CircularDependencyPlugin = require("circular-dependency-plugin");
const cssnano = require("cssnano");
const customProperties = require("postcss-custom-properties");
const ExtendedDefinePlugin = require("extended-define-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const path = require("path");
const postcssUrl = require("postcss-url");
const ProgressPlugin = require("webpack/lib/ProgressPlugin");
const webpack = require("webpack");
const webpackMerge = require("webpack-merge");
const {AngularCompilerPlugin, PLATFORM} = require("@ngtools/webpack");

// tslint:disable-next-line:no-var-requires
const packageJSON = require(path.join(process.cwd(), "package.json"));

const cssRuleUse = [
    "css-loader",
    {
        loader: "postcss-loader",
        options: {
            // TODO handle sourceMap
            sourceMap: true,
            ident: "postcss",
            plugins: () => {
                return [
                    postcssUrl(),
                    autoprefixer(),
                    customProperties({preserve: true}),
                    cssnano({
                        autoprefixer: false,
                        discardComments: true,
                        mergeLonghand: false,
                        safe: true,
                    }),
                ];
            },
        },
    },
];

const rootContext = process.cwd();
const context = path.resolve(__dirname);
const rootConfig = require(path.join(rootContext, "webpack.config.js"));

const envs = {
    production: "production",
    development: "development",
    test: "test",
};

const metadata = {
    devHost: process.env.HOST || "localhost",
    devPort: process.env.PORT || 3000,
    env: {
        value: process.env.NODE_ENV_RUNTIME || envs.development,
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
    assetsOutputFormat: "[name].[hash].[ext]",
    paths: {
        src: path.resolve(context, "./src"),
        app: path.resolve(context, "./src/app/"),
        output: path.resolve(rootContext, "./app/web/"),
        tsConfig: path.resolve(context, "./tsconfig.json"),
    },
};

// prefer JIT over AOT in dev mode
const aotEnabled = metadata.env.isProduction();
const hrmEnabled = !metadata.env.isProduction();

// tslint:disable-next-line:no-console
// console.log(`metadata: ${JSON.stringify(metadata, null, 4)}`);

if (!(metadata.env.value in envs)) {
    throw new Error("NODE_ENV_RUNTIME is not defined");
}

const config = {
    common: {
        target: "electron-renderer",
        entry: {
            app: [
                ...(aotEnabled ? [] : ["core-js/es7/reflect"]),
                path.join(metadata.paths.src, "index.ts"),
            ],
        },
        output: {
            path: metadata.paths.output,
        },
        resolve: {
            extensions: ["*", ".js", ".ts"],
            alias: {
                ...rootConfig.resolve.alias,
            },
        },
        module: {
            rules: [
                {
                    test: /[\/\\]@angular[\/\\].+\.js$/,
                    sideEffects: false,
                    parser: {
                        system: true,
                    },
                },
                ...(metadata.env.isTest() ? [] : [
                    {
                        test: /\.css$/,
                        use: [MiniCssExtractPlugin.loader].concat(cssRuleUse),
                    },
                    {
                        test: /\.scss$/,
                        use: [MiniCssExtractPlugin.loader].concat(
                            cssRuleUse.concat([
                                "sass-loader",
                            ]),
                        ),
                        exclude: [
                            metadata.paths.app,
                        ],
                    },
                ]),
                {
                    test: /\.scss$/,
                    use: ["to-string-loader"].concat(
                        cssRuleUse.concat([
                            "resolve-url-loader",
                            "sass-loader",
                        ]),
                    ),
                    include: [
                        metadata.paths.app,
                    ],
                },
                {
                    test: /\.html$/,
                    loader: "raw-loader",
                },
                {
                    test: /\.(ico|gif|png|jpe?g|svg)$/i,
                    use: {
                        loader: "url-loader",
                        options: {
                            limit: 4096,
                            name: `images/${metadata.assetsOutputFormat}`,
                        },
                    },
                },
                {
                    test: /\.(eot|ttf|otf|woff|woff2)$/,
                    use: {
                        loader: "url-loader",
                        options: {
                            limit: 4096,
                            name: `fonts/${metadata.assetsOutputFormat}`,
                        },
                    },
                },
            ],
        },
        plugins: [
            ...(metadata.env.isTest() ? [] : [
                new MiniCssExtractPlugin(),
                new HtmlWebpackPlugin({
                    filename: "index.html",
                    hash: metadata.env.isProduction(),
                    minify: false,
                    template: path.join(metadata.paths.src, "index.ejs"),
                }),
            ]),
            new ExtendedDefinePlugin({
                APP_CONSTANTS: {
                    appName: packageJSON.name,
                    isDevEnv: metadata.env.isDevelopment(),
                    isProdEnv: metadata.env.isProduction(),
                    isHrm: hrmEnabled,
                },
            }),
            new webpack.EnvironmentPlugin({
                NODE_ENV_RUNTIME: metadata.env.value,
            }),
            new CircularDependencyPlugin({
                exclude: /([\\\/])node_modules([\\\/])/,
                failOnError: true,
            }),
            new AngularCompilerPlugin({
                // compilerOptions: {},
                entryModule: `${path.join(metadata.paths.src, "app/app.module")}#AppModule`,
                platform: PLATFORM.Browser,
                skipCodeGeneration: !aotEnabled,
                tsConfigPath: metadata.paths.tsConfig,
            }),
        ],
    },

    development: {
        mode: "development",
        devServer: {
            port: metadata.devPort,
            host: metadata.devHost,
            hot: hrmEnabled,
            inline: true,
            stats: "minimal",
            clientLogLevel: "error",
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: "@ngtools/webpack",
                },
            ],
        },
        plugins: [
            ...(hrmEnabled ? [new webpack.HotModuleReplacementPlugin()] : []),
            // new SourceMapDevToolPlugin({
            //     filename: "[file].map[query]",
            //     moduleFilenameTemplate: "[resource-path]",
            //     fallbackModuleFilenameTemplate: "[resource-path]?[hash]",
            //     sourceRoot: "webpack:///"
            // }),
        ],
    },

    production: {
        mode: "production",
        module: {
            rules: [
                {
                    test: /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/,
                    use: [
                        "@angular-devkit/build-optimizer/webpack-loader",
                        "@ngtools/webpack",
                    ],
                },
            ],
        },
        plugins: [
            ...(process.env.CI ? [] : [new ProgressPlugin()]),
        ],
    },
};

config.test = {
    mode: "production",
    target: "node",
    entry: null,
    output: null,
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "@ngtools/webpack",
            },
            {
                test: /\.(css|scss|html|ico|gif|png|jpe?g|svg|eot|ttf|otf|woff|woff2)$/i,
                loader: "null-loader",
            },
        ],
    },
    plugins: [
        new ExtendedDefinePlugin({
            __ELECTRON_EXPOSURE__: {
                ipcRenderer: {},
            },
        }),
    ],
    // webpack 4 compatibility issue workaround: https://github.com/webpack-contrib/karma-webpack/issues/322
    optimization: {
        splitChunks: false,
        runtimeChunk: false,
    },
    node: {
        global: true,
        process: false,
        crypto: "empty",
        module: false,
        clearImmediate: false,
        setImmediate: false,
    },
};

const result = webpackMerge(config.common, config[metadata.env.value]);

// console.log(JSON.stringify(result, null, 2));

module.exports = result;
