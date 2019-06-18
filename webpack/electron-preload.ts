import {Configuration} from "webpack";

import {ENVIRONMENT, awesomeTypescriptLoaderRule, buildBaseConfig, srcRelativePath} from "./lib";

const configs = [
    buildRendererConfig(
        {
            "electron-preload/about": srcRelativePath(`./electron-preload/about/index.ts`),
        },
        srcRelativePath("./electron-preload/about/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/browser-window": srcRelativePath(`./electron-preload/browser-window/build-env-based/${ENVIRONMENT}.ts`),
            "electron-preload/browser-window-e2e": srcRelativePath("./electron-preload/browser-window/e2e.ts"),
        },
        srcRelativePath("./electron-preload/browser-window/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/search-in-page-browser-view": srcRelativePath(`./electron-preload/search-in-page-browser-view/index.ts`),
        },
        srcRelativePath("./electron-preload/search-in-page-browser-view/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/database-indexer": srcRelativePath(`./electron-preload/database-indexer/index.ts`),
        },
        srcRelativePath("./electron-preload/database-indexer/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/webview/protonmail": srcRelativePath("./electron-preload/webview/protonmail/index.ts"),
        },
        srcRelativePath("./electron-preload/webview/protonmail/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/webview/tutanota": srcRelativePath("./electron-preload/webview/tutanota/index.ts"),
        },
        srcRelativePath("./electron-preload/webview/tutanota/tsconfig.json"),
    ),
];

export default configs;

function buildRendererConfig(entry: Configuration["entry"], tsConfigFile: string) {
    return buildBaseConfig(
        {
            target: "electron-renderer",
            entry,
            module: {
                rules: [
                    awesomeTypescriptLoaderRule({tsConfigFile}),
                ],
            },
        },
        {
            tsConfigFile,
        },
    );
}
