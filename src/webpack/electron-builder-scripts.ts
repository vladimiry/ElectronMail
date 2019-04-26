import nodeExternals from "webpack-node-externals";
import path from "path";

import {buildBaseConfig, rootRelateivePath} from "./lib";

const moduleRelativePath = (...value: string[]) => path.join(
    rootRelateivePath("./scripts/electron-builder"),
    ...value,
);

const tsConfigFile = moduleRelativePath("./tsconfig.json");

export default buildBaseConfig(
    {
        mode: "none",
        devtool: false,
        target: "node",
        entry: {
            "after-pack": moduleRelativePath("./after-pack.ts"),
        },
        output: {
            path: moduleRelativePath("."),
            ...{
                // https://github.com/webpack/webpack/issues/2030#issuecomment-232886608
                library: "",
                libraryTarget: "commonjs",
            },
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
            nodeExternals(),
        ],
    },
    {
        tsConfigFile,
    },
);
