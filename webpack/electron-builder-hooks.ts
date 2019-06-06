import nodeExternals from "webpack-node-externals";
import path from "path";
import {Configuration} from "webpack";

import {LoaderConfig as TsLoaderConfig} from "awesome-typescript-loader/src/interfaces";
import {buildBaseConfig, rootRelativePath} from "./lib";

const hooksDir = (...value: string[]) => path.join(
    rootRelativePath("./scripts/electron-builder/hooks"),
    ...value,
);

// TODO scan folder automatically
const hooksToBuild = [
    // "afterAllArtifactBuild",
    "afterPack",
];

const configurations: Configuration[] = hooksToBuild.map((hookDirName) => {
    const hookDir = path.join(hooksDir(hookDirName));
    const tsConfigFile = path.join(hookDir, "tsconfig.json");

    return buildBaseConfig(
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
                            options: {
                                configFileName: tsConfigFile,
                            } as TsLoaderConfig,
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
});

export default configurations;
