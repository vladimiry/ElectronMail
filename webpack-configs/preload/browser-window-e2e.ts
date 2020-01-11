import path from "path";

import {buildRendererConfig} from "./lib";
import {srcRelativePath} from "webpack-configs/lib";

const dir = srcRelativePath("./electron-preload/browser-window/e2e");

export default buildRendererConfig(
    {
        "electron-preload/browser-window-e2e": path.join(dir, "./index.ts"),
    },
    path.join(dir, "./tsconfig.json"),
);
