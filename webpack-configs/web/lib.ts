import HtmlWebpackPlugin from "html-webpack-plugin";
import {Configuration, RuleSetRule} from "webpack";
import {merge as webpackMerge} from "webpack-merge";

import {BuildEnvVars} from "webpack-configs/model";
import {ENVIRONMENT, ENVIRONMENT_STATE, buildBaseConfig, outputRelativePath, srcRelativePath, typescriptLoaderRule} from "./../lib";
import {MiniCssExtractPlugin, postCssUrl} from "webpack-configs/require-import";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/webpack-conts";

export const browserWindowPath = (...value: string[]): string => {
    return srcRelativePath("./web/browser-window", ...value);
};

export const browserWindowAppPath = (...value: string[]): string => {
    return browserWindowPath("./app", ...value);
};

export function cssRuleSetRules(): RuleSetRule[] {
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
                postcssOptions: {
                    plugins: [
                        postCssUrl(),
                    ],
                },
            },
        },
    ];
}

export function buildMinimalWebConfig(
    configPatch: Configuration,
    options: {
        chunkName: keyof typeof WEBPACK_WEB_CHUNK_NAMES;
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
                    publicPath: "",
                },
                module: {
                    rules: [
                        {
                            test: /\.html$/,
                            loader: "html-loader",
                            options: {
                                minimize: false,
                                esModule: false,
                            },
                        },
                        {
                            test: /\.css$/,
                            use: [
                                MiniCssExtractPlugin.loader,
                                ...cssRuleSetRules(),
                            ],
                        },
                        {
                            test: /\.scss$/,
                            use: [
                                MiniCssExtractPlugin.loader,
                                ...cssRuleSetRules(),
                                "sass-loader",
                            ],
                            exclude: [
                                browserWindowAppPath("/"),
                            ],
                        },
                        {
                            test: /\.(eot|ttf|otf|woff|woff2|ico|gif|png|jpe?g|svg)$/i,
                            use: {
                                loader: "url-loader",
                                options: {
                                    limit: 4096,
                                    name: "assets/[name].[hash].[ext]",
                                    esModule: false,
                                    // TODO webpack url/file-loader:
                                    //      drop "esModule" flag on https://github.com/webpack-contrib/html-loader/issues/203 resolving
                                },
                            },
                        },
                    ],
                },
                resolve: {
                    fallback: {
                        "path": false,
                        "fs": false,
                    },
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
        tsConfigFile?: string
        chunkName: keyof typeof WEBPACK_WEB_CHUNK_NAMES
        typescriptLoader?: boolean
        entries?: Record<string, string>
        htmlWebpackPlugin?: Partial<HtmlWebpackPlugin.Options>,
    },
): Configuration {
    const chunkPath = (...value: string[]): string => {
        return srcRelativePath("./web", options.chunkName, ...value);
    };
    const tsConfigFile = options.tsConfigFile ?? chunkPath("./tsconfig.json");
    const environmentBasedPatch: Record<BuildEnvVars["BUILD_ENVIRONMENT"], Configuration> = {
        production: {},
        development: {},
        e2e: {},
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
                    ...options.entries,
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
                        ...options.htmlWebpackPlugin,
                    }),
                ],
            },
            options,
        ),
        environmentBasedPatch[ENVIRONMENT],
        configPatch,
    );
}
