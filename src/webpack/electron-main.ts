import nodeExternals from "webpack-node-externals";

import {buildBaseConfig, srcRelateivePath} from "./lib";

const tsConfigFile = srcRelateivePath("./electron-main/tsconfig.json");

export default buildBaseConfig(
    {
        target: "electron-main",
        entry: {
            "electron-main": srcRelateivePath("./electron-main/index.ts"),
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
