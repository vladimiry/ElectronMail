import {buildRendererConfig} from "./lib";
import {srcRelativePath} from "webpack-configs/lib";

export default buildRendererConfig(
    {
        "electron-preload/about": srcRelativePath(`./electron-preload/about/index.ts`),
    },
    srcRelativePath("./electron-preload/about/tsconfig.json"),
);
