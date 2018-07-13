import {Entry, EntryFunc} from "webpack";

import {buildBaseConfig, environment, srcPath} from "./lib";

const configs = [
    buildRendererConfig(
        {
            "electron-preload/browser-window": srcPath(`./electron-preload/browser-window/build-env-based/${environment}.ts`),
            "electron-preload/browser-window-e2e": srcPath("./electron-preload/browser-window/e2e.ts"),
        },
        srcPath("./electron-preload/browser-window/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/webview/protonmail": srcPath("./electron-preload/webview/protonmail/index.ts"),
        },
        srcPath("./electron-preload/webview/protonmail/tsconfig.json"),
    ),
    buildRendererConfig(
        {
            "electron-preload/webview/tutanota": srcPath("./electron-preload/webview/tutanota/index.ts"),
        },
        srcPath("./electron-preload/webview/tutanota/tsconfig.json"),
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
