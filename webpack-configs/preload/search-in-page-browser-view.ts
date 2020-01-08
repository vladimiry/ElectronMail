import {buildRendererConfig} from "./lib";
import {srcRelativePath} from "webpack-configs/lib";

export default buildRendererConfig(
    {
        "electron-preload/search-in-page-browser-view": srcRelativePath(`./electron-preload/search-in-page-browser-view/index.ts`),
    },
    srcRelativePath("./electron-preload/search-in-page-browser-view/tsconfig.json"),
);
