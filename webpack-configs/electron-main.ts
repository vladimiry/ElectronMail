import nodeExternals from "webpack-node-externals";

import {buildBaseConfig, srcRelativePath, typescriptLoaderRule} from "./lib";

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
                    exclude: ["devDependencies"],
                    include: ["dependencies"],
                } as any,
            }),
        ],
    },
    {
        tsConfigFile,
    },
);
