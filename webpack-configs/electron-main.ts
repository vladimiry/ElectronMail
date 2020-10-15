import {buildBaseConfig, srcRelativePath, typescriptLoaderRule} from "./lib";
import {nodeExternals} from "webpack-configs/require-import";

const tsConfigFile = srcRelativePath("./electron-main/tsconfig.json");

export default buildBaseConfig(
    {
        target: "electron-main",
        entry: {
            "electron-main": srcRelativePath("./electron-main/index.ts"),
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
