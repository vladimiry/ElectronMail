import {ENVIRONMENT_STATE, buildBaseConfig, srcRelativePath, typescriptLoaderRule} from "./lib";
import {nodeExternals} from "webpack-configs/require-import";

const tsConfigFile = srcRelativePath("./electron-main/tsconfig.json");

export default buildBaseConfig(
    {
        target: "electron-main",
        entry: {
            [ENVIRONMENT_STATE.e2e ? "electron-main-e2e" : "electron-main"]: srcRelativePath("./electron-main/index.ts"),
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
