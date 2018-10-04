import {Configuration} from "webpack";

import {buildBaseConfig, environment, environmentSate, rootRelateivePath, srcRelateivePath} from "./lib";

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

function buildRendererConfig(entry: Configuration["entry"], tsConfigFile: string) {
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
            ...(environmentSate.development && {
                resolve: {
                    alias: {
                        [rootRelateivePath("./node_modules/electron-log/lib/original-console.js")]:
                            srcRelateivePath("./webpack/lib/electron-log/console-stub.ts"),
                    },
                },
            }),
        },
        {
            tsConfigFile,
        },
    );
}
