import {Configuration, type LoaderContext, RuleSetRule} from "webpack";
import {doNothing} from "remeda";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import path from "path";
import {merge as webpackMerge} from "webpack-merge";

import {buildBaseConfig, ENVIRONMENT, ENVIRONMENT_STATE, outputRelativePath, srcRelativePath, typescriptLoaderRule} from "../lib";
import {BuildEnvVars} from "webpack-configs/model";
import {HOVERED_HREF_HIGHLIGHTER_RENDER_VISIBLE_CLASS_NAME} from "src/electron-preload/lib/hovered-href-highlighter/const";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/const/webpack";

export const sassLoaderRuleSetRules: RuleSetRule[] = [{
    loader: "sass-loader",
    options: {
        additionalData: (content: string, loaderContext: LoaderContext<string>) => {
            const {resourcePath, rootContext} = loaderContext;
            const relativePath = path.relative(rootContext, resourcePath);
            return relativePath.endsWith("src/electron-preload/lib/hovered-href-highlighter/index.scss")
                ? `$hovered-href-highlighter-render-visible-class:${HOVERED_HREF_HIGHLIGHTER_RENDER_VISIBLE_CLASS_NAME};${content}`
                : content;
        },
        warnRuleAsWarning: true,
        // TODO sass: drop logging suppressing
        sassOptions: (/* loaderContext */) => {
            // const logger = loaderContext.getLogger("sass-loader");
            return {logger: {debug: doNothing, warn: doNothing}};
        },
    },
}];

export const browserWindowPath = (...value: string[]): string => {
    return srcRelativePath("./web/browser-window", ...value);
};

export const browserWindowAppPath = (...value: string[]): string => {
    return browserWindowPath("./app", ...value);
};

export function cssRuleSetRules(): RuleSetRule[] {
    return [{loader: "css-loader"}, {
        loader: "postcss-loader",
        options: {
            sourceMap: false, // TODO handle sourceMap
            postcssOptions: {plugins: ["postcss-url"]},
        },
    }];
}

export function buildMinimalWebConfig(
    configPatch: Configuration,
    options: {chunkName: keyof typeof WEBPACK_WEB_CHUNK_NAMES},
): Configuration {
    const chunkPath = (...value: string[]): string => {
        return srcRelativePath("./web", options.chunkName, ...value);
    };

    return webpackMerge(
        buildBaseConfig({
            target: "web",
            entry: {index: chunkPath("./index.ts")},
            output: {path: outputRelativePath("./web", options.chunkName), publicPath: "", libraryTarget: "module"},
            experiments: {outputModule: true},
            module: {
                rules: [{test: /\.html$/, use: [{loader: "html-loader", options: {minimize: false}}]}, {
                    test: /\.css$/,
                    use: [MiniCssExtractPlugin.loader, ...cssRuleSetRules()],
                }, {
                    test: /\.scss$/,
                    use: [MiniCssExtractPlugin.loader, ...cssRuleSetRules(), ...sassLoaderRuleSetRules],
                    exclude: [browserWindowAppPath("/")],
                }, {test: /\.(eot|ttf|otf|woff|woff2|ico|gif|png|jpe?g|svg)$/i, type: "asset"}],
            },
            resolve: {fallback: {"path": false, "fs": false}},
            plugins: [new MiniCssExtractPlugin()],
        }),
        configPatch,
    );
}

export function buildBaseWebConfig(
    configPatch: Configuration,
    options: {
        tsConfigFile?: string;
        chunkName: keyof typeof WEBPACK_WEB_CHUNK_NAMES;
        typescriptLoader?: boolean;
        entries?: Record<string, string>;
        htmlWebpackPlugin?: Partial<HtmlWebpackPlugin.Options>;
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
        test: {},
    };

    return webpackMerge(
        buildMinimalWebConfig({
            entry: {index: chunkPath("./index.ts"), ...options.entries},
            module: {rules: [...(options.typescriptLoader ? [typescriptLoaderRule({tsConfigFile})] : [])]},
            plugins: [
                new HtmlWebpackPlugin({
                    template: chunkPath("./index.ejs"),
                    filename: "index.html",
                    hash: ENVIRONMENT_STATE.production,
                    minify: false,
                    scriptLoading: "module",
                    ...options.htmlWebpackPlugin,
                }),
            ],
        }, options),
        environmentBasedPatch[ENVIRONMENT],
        configPatch,
    );
}
