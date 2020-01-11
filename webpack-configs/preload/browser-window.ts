import path from "path";

import {ENVIRONMENT, srcRelativePath} from "webpack-configs/lib";
import {buildRendererConfig} from "./lib";

const dir = srcRelativePath("./electron-preload/browser-window", ENVIRONMENT);

export default buildRendererConfig(
    {
        "electron-preload/browser-window": path.join(dir, "./index.ts"),
    },
    path.join(dir, "./tsconfig.json"),
);
