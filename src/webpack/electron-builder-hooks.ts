import fs from "fs";
import nodeExternals from "webpack-node-externals";
import path from "path";
import {Configuration} from "webpack";

import {buildBaseConfig, rootRelateivePath} from "./lib";

const hooksDir = (...value: string[]) => path.join(
    rootRelateivePath("./scripts/electron-builder/hooks"),
    ...value,
);

const configurations: Configuration[] = [];

for (const name of fs.readdirSync(hooksDir())) {
    // TODO make sure "hookDir" is actually a directory, not a file
    const hookDir = path.resolve(hooksDir(), name);
    const tsConfigFile = path.join(hookDir, "tsconfig.json");

    configurations.push(
        buildBaseConfig(
            {
                mode: "none",
                devtool: false,
                target: "node",
                entry: {
                    index: hookDir,
                },
                output: {
                    path: hookDir,
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
        ),
    );
}

export default configurations;
