import nodeExternals from "webpack-node-externals";

import {awesomeTypescriptLoaderRule, buildBaseConfig, srcRelativePath} from "./lib";

const tsConfigFile = srcRelativePath("./electron-main/tsconfig.json");

export default buildBaseConfig(
    {
        target: "electron-main",
        entry: {
            "electron-main": srcRelativePath("./electron-main/index.ts"),
        },
        module: {
            rules: [
                awesomeTypescriptLoaderRule({tsConfigFile}),
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
