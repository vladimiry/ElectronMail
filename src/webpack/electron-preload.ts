import {Entry, EntryFunc} from "webpack";

import {buildBaseConfig, environment, srcRelateivePath} from "./lib";

const configs = [
    buildRendererConfig(
        {
            "electron-preload/browser-window": srcRelateivePath(`./electron-preload/browser-window/build-env-based/${environment}.ts`),
            "electron-preload/browser-window-e2e": srcRelateivePath("./electron-preload/browser-window/e2e.ts"),
        },
        srcRelateivePath("./electron-preload/browser-window/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/webview/stub": srcRelateivePath("./electron-preload/webview/stub/index.ts"),
        },
        srcRelateivePath("./electron-preload/webview/stub/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/webview/protonmail": srcRelateivePath("./electron-preload/webview/protonmail/index.ts"),
        },
        srcRelateivePath("./electron-preload/webview/protonmail/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/webview/tutanota": srcRelateivePath("./electron-preload/webview/tutanota/index.ts"),
        },
        srcRelateivePath("./electron-preload/webview/tutanota/tsconfig.json"),
    ),
];

export default configs;

function buildRendererConfig(entry: string | string[] | Entry | EntryFunc, tsConfigFile: string) {
    return buildBaseConfig(
        {
            target: "electron-renderer",
            entry,
            module: {
                rules: [
                    {
                        test: /\.ts$/,
                        use: {
                            loader: "awesome-typescript-loader",
                            options: {configFileName: tsConfigFile},
                        },
                    },
                ],
            },
        },
        {
            tsConfigFile,
        },
    );
}
