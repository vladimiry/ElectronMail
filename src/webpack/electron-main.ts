import nodeExternals from "webpack-node-externals";

import {buildConfig, srcPath} from "./lib";

const tsConfigFile = srcPath("./electron-main/tsconfig.json");

export default buildConfig(
    {
        target: "electron-main",
        entry: {
            "electron-main": srcPath("./electron-main/index.ts"),
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: {
                        loader: "awesome-typescript-loader",
                        options: {configFileName: tsConfigFile},
                    },
                },
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
