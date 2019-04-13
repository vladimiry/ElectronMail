import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import postCssUrl from "postcss-url";
import webpackMerge from "webpack-merge";
import webpack, {Configuration} from "webpack";
import {AngularCompilerPlugin, PLATFORM} from "@ngtools/webpack";
import {CompilerOptions} from "typescript";

import {BuildEnvironment} from "src/shared/model/common";
import {buildBaseConfig, environment, environmentSate, outputRelateivePath, srcRelateivePath} from "./lib";

// tslint:disable:no-var-requires
// TODO use ES6 import format
const cssNano = require("cssnano");
const customProperties = require("postcss-custom-properties");
// TODO import "@angular/compiler-cli" using ES6 import format on  https://github.com/angular/angular/issues/29220 resolving
const {readConfiguration} = require("@angular/compiler-cli");
// tslint:enable:no-var-requires

const webSrcPath = (...value: string[]) => srcRelateivePath("./web/src", ...value);
const webAppPath = (...value: string[]) => webSrcPath("./app", ...value);
const webSrcEnvPath = (...value: string[]) => webSrcPath(
    "./environments", environmentSate.development ? "./development" : "./production",
    ...value,
);

const aot = environmentSate.production;
const cssRuleUse = [
    "css-loader",
    {
        loader: "postcss-loader",
        options: {
            sourceMap: false, // TODO handle sourceMap
            ident: "postcss",
            plugins: () => {
                return [
                    postCssUrl(),
                    customProperties({preserve: true}),
                    cssNano({
                        autoprefixer: true,
                        discardComments: true,
                        mergeLonghand: false,
                        safe: true,
                    }),
                ];
            },
        },
    },
];
const tsConfigFile = srcRelateivePath(({
    production: "./web/tsconfig.json",
    development: "./web/tsconfig.development.json",
    test: "./web/test/tsconfig.json",
} as Record<BuildEnvironment, string>)[environment]);
const tsConfigCompilerOptions: CompilerOptions = (() => {
    const tsConfig = readConfiguration(tsConfigFile);

    if (!tsConfig.options.paths) {
        tsConfig.options.paths = {};
    }
    tsConfig.options.paths["src/web/src/environments/*"] = [webSrcEnvPath() + "/*"];

    return tsConfig.options;
})();
const baseConfig = buildBaseConfig(
    {
        target: "web",
        entry: {
            "app": [
                ...(aot ? [] : ["core-js/proposals/reflect-metadata"]),
                webSrcPath("./index.ts"),
            ],
            "search-in-page-browser-view": webSrcPath("./search-in-page-browser-view/index.ts"),
        },
        output: {
            path: outputRelateivePath("./web"),
        },
        node: {
            path: "empty",
            fs: "empty",
            __dirname: false,
            __filename: false,
            Buffer: false,
            global: false,
            process: false,
            setImmediate: false,
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
                {
                    test: /\.html$/,
                    loader: "html-loader",
                },
                {
                    test: /\.css$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        ...cssRuleUse,
                    ],
                },
                {
                    test: /\.scss$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        ...cssRuleUse,
                        "sass-loader",
                    ],
                    exclude: [
                        webAppPath(),
                    ],
                },
                {
                    test: /\.scss$/,
                    use: [
                        "to-string-loader",
                        ...cssRuleUse,
                        "resolve-url-loader",
                        "sass-loader",
                    ],
                    include: [
                        webAppPath(),
                    ],
                },
                {
                    test: /\.(eot|ttf|otf|woff|woff2|ico|gif|png|jpe?g|svg)$/i,
                    use: {
                        loader: "url-loader",
                        options: {
                            limit: 4096,
                            name: "assets/[name].[hash].[ext]",
                        },
                    },
                },
            ],
        },
        plugins: [
            new webpack.DefinePlugin({
                "process.env.APP_AOT": JSON.stringify(aot),
            }),
            new MiniCssExtractPlugin(),
            new HtmlWebpackPlugin({
                template: webSrcPath("./index.ejs"),
                filename: "index.html",
                hash: environmentSate.production,
                minify: false,
                excludeChunks: ["search-in-page-browser-view"],
            }),
            new HtmlWebpackPlugin({
                template: webSrcPath("./search-in-page-browser-view/index.ejs"),
                filename: "search-in-page-browser-view.html",
                hash: environmentSate.production,
                minify: false,
                chunks: ["search-in-page-browser-view"],
            }),
            new AngularCompilerPlugin({
                entryModule: `${webSrcEnvPath("app.module")}#AppModule`,
                additionalLazyModules: {
                    [`./_db-view/db-view.module#DbViewModule`]: webSrcPath("./app/_db-view/db-view.module.ts"),
                },
                platform: PLATFORM.Browser,
                skipCodeGeneration: !aot,
                tsConfigPath: tsConfigFile,
                compilerOptions: tsConfigCompilerOptions,
            }),
        ],
        ...(environment !== "test" && {
            optimization: {
                runtimeChunk: environmentSate.development,
                splitChunks: {
                    chunks: "all",
                    name: true,
                    cacheGroups: {
                        vendors: {
                            test: /([\\/]node_modules[\\/])|([\\/]src[\\/]web[\\/]src[\\/]vendor[\\/])/,
                        },
                    },
                },
            },
        }),
    },
    {
        tsConfigFile,
    },
);
const configPatch: Record<BuildEnvironment, Configuration> = {
    production: {
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
    },
    development: {
        devServer: {
            host: "127.0.0.1",
            hot: true,
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
            new webpack.HotModuleReplacementPlugin(),
        ],
    },
    test: {
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: "@ngtools/webpack",
                },
                {
                    test: /\.(css|scss|eot|ttf|otf|woff|woff2|ico|gif|png|jpe?g|svg)$/i,
                    loader: "null-loader",
                },
            ],
        },
    },
};

const config = webpackMerge(
    baseConfig,
    configPatch[environment],
);

export default config;
