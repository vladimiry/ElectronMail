import {buildRendererConfig} from "./lib";
import {srcRelativePath} from "webpack-configs/lib";

export default buildRendererConfig(
    {
        "electron-preload/webview/calendar": srcRelativePath("./electron-preload/webview/calendar/index.ts"),
    },
    srcRelativePath("./electron-preload/webview/calendar/tsconfig.json"),
);
