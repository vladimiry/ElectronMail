import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import postCssUrl from "postcss-url";
import webpackMerge from "webpack-merge";
import {AngularCompilerPlugin, NgToolsLoader, PLATFORM} from "@ngtools/webpack";
import {Configuration} from "webpack";

import {BuildEnvironment} from "src/shared/model/common";
import {buildBaseConfig, environment, environmentSate, outputRelativePath, srcRelativePath} from "./lib";

// tslint:disable:no-var-requires
// TODO use ES6 import format
const cssNano = require("cssnano");
const customProperties = require("postcss-custom-properties");
// TODO import "@angular/compiler-cli" using ES6 import format on  https://github.com/angular/angular/issues/29220 resolving
const {readConfiguration} = require("@angular/compiler-cli");
// tslint:enable:no-var-requires

const webSrcPath = (...value: string[]) => srcRelativePath("./web/src", ...value);
const webAppPath = (...value: string[]) => webSrcPath("./app", ...value);

// TODO support AOT compilation when running in "test" mode
const aot = !environmentSate.test;
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
const tsConfigFile = srcRelativePath(({
    production: "./web/tsconfig.json",
    development: "./web/tsconfig.development.json",
    test: "./web/test/tsconfig.json",
} as Record<BuildEnvironment, string>)[environment]);
const chunkNames = {
    "app": "app",
    "about": "about",
    "search-in-page-browser-view": "search-in-page-browser-view",
};
const baseConfig = buildBaseConfig(
    {
        target: "web",
        entry: {
            [chunkNames.app]: [
                webSrcPath("./index.ts"),
            ],
            [chunkNames.about]: webSrcPath("./about/index.ts"),
            [chunkNames["search-in-page-browser-view"]]: webSrcPath("./search-in-page-browser-view/index.ts"),
        },
        output: {
            path: outputRelativePath("./web"),
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
                ...(
                    aot
                        ? (
                            [{
                                test: /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/,
                                use: [
                                    "@angular-devkit/build-optimizer/webpack-loader",
                                    NgToolsLoader,
                                ],
                            }]
                        )
                        : (
                            [{
                                test: /\.ts$/,
                                use: [
                                    NgToolsLoader,
                                ],
                            }]
                        )
                ),
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
            new MiniCssExtractPlugin(),
            new HtmlWebpackPlugin({
                template: webSrcPath("./index.ejs"),
                filename: "index.html",
                hash: environmentSate.production,
                minify: false,
                excludeChunks: [
                    chunkNames.about,
                    chunkNames["search-in-page-browser-view"],
                ],
            }),
            new HtmlWebpackPlugin({
                template: webSrcPath("./about/index.ejs"),
                filename: "about.html",
                hash: environmentSate.production,
                minify: false,
                chunks: [chunkNames.about],
            }),
            new HtmlWebpackPlugin({
                template: webSrcPath("./search-in-page-browser-view/index.ejs"),
                filename: "search-in-page-browser-view.html",
                hash: environmentSate.production,
                minify: false,
                chunks: [chunkNames["search-in-page-browser-view"]],
            }),
            new AngularCompilerPlugin({
                entryModule: `${webSrcPath("./app/app.module")}#AppModule`,
                additionalLazyModules: {
                    [`./_db-view/db-view.module#DbViewModule`]: webSrcPath("./app/_db-view/db-view.module.ts"),
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
    },
    {
        tsConfigFile,
    },
);
const configPatch: Record<BuildEnvironment, Configuration> = {
    production: {},
    development: {},
    test: {
        module: {
            rules: [
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
