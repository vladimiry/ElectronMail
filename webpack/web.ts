import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import postCssUrl from "postcss-url";
import webpackDevServer from "webpack-dev-server";
import webpackMerge from "webpack-merge";
import {AngularCompilerPlugin, NgToolsLoader, PLATFORM} from "@ngtools/webpack";
import {Configuration, RuleSetUseItem} from "webpack";

import {BuildEnvironment} from "src/shared/model/common";
import {
    ENVIRONMENT,
    ENVIRONMENT_SATE,
    awesomeTypescriptLoaderRule,
    buildBaseConfig,
    outputRelativePath,
    rootRelativePath,
    srcRelativePath,
} from "./lib";
import {WEB_CHUNK_NAMES} from "src/shared/constants";

const browserWindowPath = (...value: string[]) => srcRelativePath("./web/browser-window", ...value);

const browserWindowAppPath = (...value: string[]) => browserWindowPath("./app", ...value);

export const CONFIGS: Readonly<Record<keyof typeof WEB_CHUNK_NAMES, Configuration>> = {
    "about": (() => {
        return buildBaseWebConfig(
            {},
            {
                chunkName: "about",
                awesomeTypescriptLoader: true,
            },
        );
    })(),

    "browser-window": (() => {
        // tslint:disable:no-var-requires
        // TODO import "@angular/compiler-cli" using ES6 import format on  https://github.com/angular/angular/issues/29220 resolving
        const {readConfiguration} = require("@angular/compiler-cli");
        // tslint:enable:no-var-requires

        const chunkPath = browserWindowPath;

        // TODO karma: enable "ivy" and "aot" modes
        const aot = !ENVIRONMENT_SATE.test;

        const tsConfigFile = chunkPath(({
            production: "./tsconfig.json",
            development: "./tsconfig.development.json",
            test: "./test/tsconfig.json",
        } as Record<BuildEnvironment, string>)[ENVIRONMENT]);

        return buildBaseWebConfig(
            {
                module: {
                    rules: [
                        {
                            test: aot
                                ? /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/
                                : /\.ts$/,
                            use: [
                                "@angular-devkit/build-optimizer/webpack-loader",
                                NgToolsLoader,
                            ],
                        },
                        {
                            test: /[\/\\]@angular[\/\\].+\.js$/,
                            sideEffects: false,
                            parser: {
                                system: true,
                            },
                        },
                        {
                            test: /\.scss$/,
                            use: [
                                "to-string-loader",
                                ...cssRuleSetUseItems(),
                                "resolve-url-loader",
                                "sass-loader",
                            ],
                            include: [
                                browserWindowAppPath(),
                            ],
                        },
                    ],
                },
                resolve: {
                    alias: {
                        images: rootRelativePath("images"),
                    },
                },
                plugins: [
                    new AngularCompilerPlugin({
                        entryModule: `${browserWindowAppPath("./app.module")}#AppModule`,
                        additionalLazyModules: {
                            ["./_db-view/db-view.module#DbViewModule"]: browserWindowAppPath("./_db-view/db-view.module.ts"),
                        },
                        platform: PLATFORM.Browser,
                        skipCodeGeneration: !aot,
                        tsConfigPath: tsConfigFile,
                        compilerOptions: readConfiguration(tsConfigFile).options,
                        nameLazyFiles: true,
                        contextElementDependencyConstructor: require("webpack/lib/dependencies/ContextElementDependency"),
                        discoverLazyRoutes: true, // TODO disable "discoverLazyRoutes" once switched to Ivy renderer
                        directTemplateLoading: false,
                    }),
                ],
                optimization: {
                    splitChunks: {
                        cacheGroups: {
                            commons: {
                                test: /[\\/]node_modules[\\/]|[\\/]vendor[\\/]/,
                                name: "vendor",
                                chunks: "all",
                            },
                        },
                    },
                },
            },
            {
                tsConfigFile,
                chunkName: "browser-window",
            },
        );
    })(),

    "search-in-page-browser-view": (() => {
        return buildBaseWebConfig(
            {},
            {
                chunkName: "search-in-page-browser-view",
                awesomeTypescriptLoader: true,
            },
        );
    })(),
};

export default [
    CONFIGS.about,
    CONFIGS["browser-window"],
    CONFIGS["search-in-page-browser-view"],
];

function buildBaseWebConfig(
    configPatch: Configuration,
    options: {
        tsConfigFile?: string;
        chunkName: keyof typeof WEB_CHUNK_NAMES;
        awesomeTypescriptLoader?: boolean;
    },
): Configuration {
    const chunkPath = (...value: string[]) => srcRelativePath("./web", options.chunkName, ...value);
    const tsConfigFile = options.tsConfigFile || chunkPath("./tsconfig.json");
    const baseConfig = buildBaseConfig(
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
                    ...(options.awesomeTypescriptLoader ? [awesomeTypescriptLoaderRule({tsConfigFile})] : []),
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
                new HtmlWebpackPlugin({
                    template: chunkPath("./index.ejs"),
                    filename: "index.html",
                    hash: ENVIRONMENT_SATE.production,
                    minify: false,
                }),
            ],
        },
        {
            tsConfigFile,
        },
    );

    const environmentBasedPatch: Record<BuildEnvironment, Configuration> = {
        production: {},
        development: {
            ...(() => {
                // handle "webpack" <=> "webpack-dev-server" TypeScript declarations inconsistency
                const devServer: webpackDevServer.Configuration = {
                    host: "127.0.0.1",
                    hot: false,
                    inline: true,
                    stats: "minimal",
                    clientLogLevel: "error",
                    writeToDisk: true,
                };
                return {
                    devServer: devServer as any,
                };
            })(),
        },
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
        baseConfig,
        environmentBasedPatch[ENVIRONMENT],
        configPatch,
    );
}

function cssRuleSetUseItems(): RuleSetUseItem[] {
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
