import path from "path";

import {ENVIRONMENT_STATE, srcRelativePath} from "webpack-configs/lib";
import {buildRendererConfig} from "./lib";

const baseEntryName = "electron-preload/webview/primary";
const src = (value: string): string => path.join(srcRelativePath(baseEntryName), value);

export default buildRendererConfig(
    {
        [`${baseEntryName}${ENVIRONMENT_STATE.e2e ? "-e2e" : ""}`]: src("./index.ts"),
    },
    src("./tsconfig.json"),
);
