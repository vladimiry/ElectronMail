import path from "path";

import {ENVIRONMENT_STATE, buildBaseConfig, srcRelativePath, typescriptLoaderRule} from "./lib";
import {nodeExternals} from "webpack-configs/require-import";

const baseEntryName = "electron-main";
const src = (value: string): string => path.join(srcRelativePath(baseEntryName), value);
const tsConfigFile = src("./tsconfig.json");

export default buildBaseConfig(
    {
        target: "electron-main",
        entry: {
            [`${baseEntryName}${ENVIRONMENT_STATE.e2e ? "-e2e" : ""}`]: src("./index.ts"),
        },
        module: {
            rules: [
                typescriptLoaderRule({tsConfigFile}),
            ],
        },
        externals: [
            nodeExternals({
                modulesFromFile: {
                    excludeFromBundle: ["devDependencies", "dependencies"],
                },
            }),
        ],
    },
    {
        tsConfigFile,
    },
);
