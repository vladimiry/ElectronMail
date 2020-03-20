import {buildRendererConfig} from "./lib";
import {srcRelativePath} from "webpack-configs/lib";

export default buildRendererConfig(
    {
        "electron-preload/webview/primary": srcRelativePath("./electron-preload/webview/primary/index.ts"),
    },
    srcRelativePath("./electron-preload/webview/primary/tsconfig.json"),
);
