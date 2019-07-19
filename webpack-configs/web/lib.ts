import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import postCssUrl from "postcss-url";
import webpackMerge from "webpack-merge";
import {Configuration, RuleSetUseItem} from "webpack";

import {BuildEnvironment} from "webpack-configs/model";
import {ENVIRONMENT, ENVIRONMENT_STATE, awesomeTypescriptLoaderRule, buildBaseConfig, outputRelativePath, srcRelativePath} from "./../lib";
import {WEB_CHUNK_NAMES} from "src/shared/constants";

export const browserWindowPath = (...value: string[]) => srcRelativePath("./web/browser-window", ...value);

export const browserWindowAppPath = (...value: string[]) => browserWindowPath("./app", ...value);

export function buildBaseWebConfig(
    configPatch: Configuration,
    options: {
        tsConfigFile?: string;
        chunkName: keyof typeof WEB_CHUNK_NAMES;
        awesomeTypescriptLoader?: boolean;
    },
): Configuration {
    const chunkPath = (...value: string[]) => srcRelativePath("./web", options.chunkName, ...value);
    const tsConfigFile = options.tsConfigFile || chunkPath("./tsconfig.json");
    const environmentBasedPatch: Record<BuildEnvironment, Configuration> = {
        production: {},
        development: {},
        test: {
            module: {
                rules: [
                    {
                        test: /\.(eot|ttf|otf|woff|woff2|ico|gif|png|jpe?g|svg)$/i,
                        loader: "null-loader",
                    },
                ],
            },
        },
    };

    return webpackMerge(
        buildMinimalWebConfig(
            {
                entry: {
                    index: chunkPath("./index.ts"),
                },
                module: {
                    rules: [
                        ...(options.awesomeTypescriptLoader ? [awesomeTypescriptLoaderRule({tsConfigFile})] : []),
                    ],
                },
                plugins: [
                    new HtmlWebpackPlugin({
                        template: chunkPath("./index.ejs"),
                        filename: "index.html",
                        hash: ENVIRONMENT_STATE.production,
                        minify: false,
                    }),
                ],
            },
            options,
        ),
        environmentBasedPatch[ENVIRONMENT],
        configPatch,
    );
}

export function buildMinimalWebConfig(
    configPatch: Configuration,
    options: {
        chunkName: keyof typeof WEB_CHUNK_NAMES;
    },
): Configuration {
    const chunkPath = (...value: string[]) => srcRelativePath("./web", options.chunkName, ...value);

    return webpackMerge(
        buildBaseConfig(
            {
                target: "web",
                entry: {
                    index: chunkPath("./index.ts"),
                },
                output: {
                    path: outputRelativePath("./web", options.chunkName),
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
                            test: /\.html$/,
                            loader: "html-loader",
                        },
                        {
                            test: /\.css$/,
                            use: [
                                MiniCssExtractPlugin.loader,
                                ...cssRuleSetUseItems(),
                            ],
                        },
                        {
                            test: /\.scss$/,
                            use: [
                                MiniCssExtractPlugin.loader,
                                ...cssRuleSetUseItems(),
                                "sass-loader",
                            ],
                            exclude: [
                                browserWindowAppPath(),
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
                    new MiniCssExtractPlugin(),
                ],
            },
        ),
        configPatch,
    );
}

export function cssRuleSetUseItems(): RuleSetUseItem[] {
    // tslint:disable:no-var-requires
    // TODO use ES6 import format
    const cssNano = require("cssnano");
    const customProperties = require("postcss-custom-properties");
    // tslint:enable:no-var-requires

    return [
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
}
