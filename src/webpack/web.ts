import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import webpack, {Configuration} from "webpack";

import {AngularCompilerPlugin, PLATFORM} from "@ngtools/webpack";
import {buildConfig, environment, environmentSate, outputPath, srcPath} from "./lib";
import {BuildEnvironment} from "_@shared/model/common";
import webpackMerge = require("webpack-merge");

// tslint:disable:no-var-requires
const cssNano = require("cssnano");
const customProperties = require("postcss-custom-properties");
const postCssUrl = require("postcss-url");
// tslint:enable:no-var-requires

const webSrcPath = (...value: string[]) => srcPath("./web/src", ...value);
const webAppPath = (...value: string[]) => webSrcPath("./app", ...value);

const aot = environmentSate.production;
const tsConfigFile = environmentSate.test ? srcPath("./web/test/tsconfig.json") : srcPath("./web/tsconfig.json");
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
const config = buildConfig(
    {
        target: "electron-renderer",
        entry: {
            app: [
                ...(aot ? [] : ["core-js/es7/reflect"]),
                webSrcPath("./index.ts"),
            ],
        },
        output: {path: outputPath("./web")},
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
                    test: /\.html$/,
                    loader: "raw-loader",
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
            new MiniCssExtractPlugin(),
            new HtmlWebpackPlugin({
                template: webSrcPath("index.ejs"),
                filename: "index.html",
                hash: environmentSate.production,
                minify: false,
            }),
            new AngularCompilerPlugin({
                entryModule: `${webAppPath("app.module")}#AppModule`,
                platform: PLATFORM.Browser,
                skipCodeGeneration: !aot,
                tsConfigPath: tsConfigFile,
            }),
        ],
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
        devtool: false,
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: "@ngtools/webpack",
                },
                {
                    test: /\.(eot|ttf|otf|woff|woff2|ico|gif|png|jpe?g|svg)$/i,
                    loader: "null-loader",
                },
            ],
        },
    },
};

export default webpackMerge(config, configPatch[environment]);
