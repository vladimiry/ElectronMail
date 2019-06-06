import nodeExternals from "webpack-node-externals";

import {LoaderConfig as TsLoaderConfig} from "awesome-typescript-loader/src/interfaces";
import {buildBaseConfig, srcRelativePath} from "./lib";

const tsConfigFile = srcRelativePath("./electron-main/tsconfig.json");

export default buildBaseConfig(
    {
        target: "electron-main",
        entry: {
            "electron-main": srcRelativePath("./electron-main/index.ts"),
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: {
                        loader: "awesome-typescript-loader",
                        options: {
                            configFileName: tsConfigFile,
                        } as TsLoaderConfig,
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
