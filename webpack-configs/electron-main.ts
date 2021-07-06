import path from "path";
import {mapValues} from "remeda";

import packageJSON from "package.json";
import {ENVIRONMENT_STATE, buildBaseConfig, srcRelativePath, typescriptLoaderRule} from "./lib";

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
        externals: mapValues(
            packageJSON.dependencies,
            (...[/* value */, key]) => `commonjs ${key}`,
        ),
    },
    {
        tsConfigFile,
    },
);
