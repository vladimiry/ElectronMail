import {mapValues} from "remeda";
import packageJSON from "package.json" assert {type: "json"};
import path from "path";
import webpack from "webpack";

import {buildBaseConfig, ENVIRONMENT_STATE, outputRelativePath, srcRelativePath, typescriptLoaderRule} from "./lib";

const baseEntryName = "electron-main";
const src = (value: string): string => path.join(srcRelativePath(baseEntryName), value);
const tsConfigFile = src("./tsconfig.json");

export default buildBaseConfig(
    {
        target: "electron-main",
        entry: {
            [`index${ENVIRONMENT_STATE.e2e ? "-e2e" : ""}`]: src("./index.ts"),
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
        output: {
            path: outputRelativePath(baseEntryName),
            filename: "[name].cjs",
        },
        plugins: [
            new webpack.optimize.LimitChunkCountPlugin({maxChunks: 1}),
        ],
    },
    {
        tsConfigFile,
    },
);
