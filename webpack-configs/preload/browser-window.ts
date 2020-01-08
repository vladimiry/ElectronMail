import {ENVIRONMENT, srcRelativePath} from "webpack-configs/lib";
import {buildRendererConfig} from "./lib";

export default buildRendererConfig(
    {
        "electron-preload/browser-window": srcRelativePath(`./electron-preload/browser-window/build-env-based/${ENVIRONMENT}.ts`),
        "electron-preload/browser-window-e2e": srcRelativePath("./electron-preload/browser-window/e2e.ts"),
    },
    srcRelativePath("./electron-preload/browser-window/tsconfig.json"),
);
