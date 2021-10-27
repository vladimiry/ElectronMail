import nodeExternals from "webpack-node-externals";
import path from "path";
import {Configuration} from "webpack";

import {buildBaseConfig, rootRelativePath, typescriptLoaderRule} from "./lib";

const hooksDir = (...value: string[]): string => {
    return path.join(
        rootRelativePath("./scripts/electron-builder/hooks"),
        ...value,
    );
};

// TODO scan folder automatically
const hooksToBuild = [
    "afterPack",
] as const;

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
                libraryTarget: "commonjs2",
                libraryExport: "default",
                filename: "[name].cjs",
            },
            module: {
                rules: [
                    typescriptLoaderRule({tsConfigFile}),
                ],
            },
            externals: [
                nodeExternals(),
            ],
            resolve: {
                alias: {
                    scripts: rootRelativePath("scripts"),
                },
            },
        },
        {
            tsConfigFile,
        },
    );
});

export default configurations;
