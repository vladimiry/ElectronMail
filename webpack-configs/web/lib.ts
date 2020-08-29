import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import postCssUrl from "postcss-url";
import {Configuration, RuleSetUseItem} from "webpack";
import {merge as webpackMerge} from "webpack-merge";

import {BuildEnvironment} from "webpack-configs/model";
import {ENVIRONMENT, ENVIRONMENT_STATE, buildBaseConfig, outputRelativePath, srcRelativePath, typescriptLoaderRule} from "./../lib";
import {WEB_CHUNK_NAMES} from "src/shared/constants";

export const browserWindowPath = (...value: string[]): string => {
    return srcRelativePath("./web/browser-window", ...value);
};

export const browserWindowAppPath = (...value: string[]): string => {
    return browserWindowPath("./app", ...value);
};

export function cssRuleSetUseItems(): RuleSetUseItem[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const cssNano = require("cssnano");

    return [
        {
            loader: "css-loader",
            options: {
                esModule: false,
            },
        },
        {
            loader: "postcss-loader",
            options: {
                sourceMap: false, // TODO handle sourceMap
                ident: "postcss",
                plugins: () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
                    return [ // eslint-disable-line @typescript-eslint/no-unsafe-return
                        postCssUrl(),
                        cssNano({ // eslint-disable-line @typescript-eslint/no-unsafe-call
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

export function buildMinimalWebConfig(
    configPatch: Configuration,
    options: {
        chunkName: keyof typeof WEB_CHUNK_NAMES;
    },
): Configuration {
    const chunkPath = (...value: string[]): string => {
        return srcRelativePath("./web", options.chunkName, ...value);
    };

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
                            options: {
                                minimize: false,
                            },
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
                                    // TODO webpack url/file-loader:
                                    //      drop "esModule" flag on https://github.com/webpack-contrib/html-loader/issues/203 resolving
                                    esModule: false,
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

export function buildBaseWebConfig(
    configPatch: Configuration,
    options: {
        tsConfigFile?: string;
        chunkName: keyof typeof WEB_CHUNK_NAMES;
        typescriptLoader?: boolean;
    },
): Configuration {
    const chunkPath = (...value: string[]): string => {
        return srcRelativePath("./web", options.chunkName, ...value);
    };
    const tsConfigFile = options.tsConfigFile ?? chunkPath("./tsconfig.json");
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
                        ...(options.typescriptLoader ? [typescriptLoaderRule({tsConfigFile})] : []),
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
