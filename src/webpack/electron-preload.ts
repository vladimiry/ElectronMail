import {buildConfig, environment, srcPath} from "./lib";

const tsConfigFile = srcPath("./electron-preload/browser-window/tsconfig.json");

export default buildConfig(
    {
        target: "electron-renderer",
        entry: {
            "electron-preload/browser-window": srcPath(`./electron-preload/browser-window/build-env-based/${environment}.ts`),
            "electron-preload/browser-window-e2e": srcPath("./electron-preload/browser-window/e2e.ts"),
            "electron-preload/webview/protonmail": srcPath("./electron-preload/webview/protonmail.ts"),
            "electron-preload/webview/tutanota": srcPath("./electron-preload/webview/tutanota.ts"),
        },
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
