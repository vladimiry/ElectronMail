import {buildRendererConfig} from "./lib";
import {srcRelativePath} from "webpack-configs/lib";

export default buildRendererConfig(
    {
        "electron-preload/database-indexer": srcRelativePath(`./electron-preload/database-indexer/index.ts`),
    },
    srcRelativePath("./electron-preload/database-indexer/tsconfig.json"),
);
