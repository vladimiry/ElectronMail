import fsExtra from "fs-extra";
import webpack, {Configuration} from "webpack";
import {merge as webpackMerge} from "webpack-merge";

import {browserWindowAppPath, sassLoaderRuleSetRules} from "webpack-configs/web/lib";
import {buildBaseConfig, ENVIRONMENT_STATE, outputRelativePath, srcRelativePath, typescriptLoaderRule} from "webpack-configs/lib";

const build = (configPatch: Configuration, tsConfigFile: string): Configuration => {
    const hoveredHrefHighlighterSassFile = srcRelativePath("./electron-preload/lib/hovered-href-highlighter/index.scss");

    if (!fsExtra.pathExistsSync(hoveredHrefHighlighterSassFile)) {
        throw new Error(`File not found: ${hoveredHrefHighlighterSassFile}`);
    }

    return buildBaseConfig(
        webpackMerge({
            target: "web",
            module: {
                rules: [typescriptLoaderRule({tsConfigFile}), {
                    test: hoveredHrefHighlighterSassFile,
                    use: [{loader: "css-loader", options: {modules: "icss"}}, ...sassLoaderRuleSetRules],
                    exclude: [browserWindowAppPath("/")],
                }],
            },
            externals: {electron: "require('electron')"},
            resolve: {fallback: {"path": false, "fs": false}},
            output: {
                path: outputRelativePath("electron-preload"),
                publicPath: "",
                // filename: "[name].cjs",
                // chunkFormat: "commonjs",
                // chunkLoading: "require",
            },
            plugins: [new webpack.optimize.LimitChunkCountPlugin({maxChunks: 1})],
        }, configPatch),
        {tsConfigFile},
    );
};

export const buildRendererConfig = (subDir: string): Configuration => {
    return build({
        entry: {[ENVIRONMENT_STATE.e2e ? "index-e2e" : "index"]: srcRelativePath(subDir, "index.ts")},
        output: {path: outputRelativePath(subDir)},
    }, srcRelativePath(subDir, "tsconfig.json"));
};
