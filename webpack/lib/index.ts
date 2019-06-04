import path from "path";
import webpackMerge from "webpack-merge";
import webpack, {Configuration} from "webpack";
import {TsconfigPathsPlugin} from "tsconfig-paths-webpack-plugin";

import {BuildEnvironment} from "src/shared/model/common";

type BuildConfig = (configPatch: Configuration, options?: { tsConfigFile?: string }) => Configuration;

const NODE_ENV = String(process.env.NODE_ENV);
const environment: BuildEnvironment = NODE_ENV === "development" || NODE_ENV === "test" ? NODE_ENV : "production";
const environmentSate = {
    production: environment === "production",
    development: environment === "development",
    test: environment === "test",
};

// tslint:disable-next-line:no-console
console.log("BuildEnvironment:", environment);

const rootRelativePath = (...value: string[]) => path.join(process.cwd(), ...value);
const srcRelativePath = (...value: string[]) => rootRelativePath("./src", ...value);
const outputRelativePath = (...value: string[]) => rootRelativePath(environmentSate.development ? "./app-dev" : "./app", ...value);

const buildBaseConfig: BuildConfig = (config, options = {}) => {
    const {tsConfigFile} = {tsConfigFile: rootRelativePath("./tsconfig.json"), ...options};

    return webpackMerge(
        {
            mode: environmentSate.development || environmentSate.test ? "development" : "production",
            devtool: false,
            output: {
                path: outputRelativePath(),
            },
            plugins: [
                new webpack.DefinePlugin({
                    "process.env.NODE_ENV": JSON.stringify(environment),
                }),
            ],
            resolve: {
                extensions: ["*", ".js", ".ts"],
                plugins: [
                    new TsconfigPathsPlugin({configFile: tsConfigFile}),
                ],
            },
            node: {
                __dirname: false,
                __filename: false,
            },
            optimization: {
                minimize: false,
                namedChunks: true,
                namedModules: true,
            },
        },
        config,
    );
};

export {
    buildBaseConfig,
    environment,
    environmentSate,
    outputRelativePath,
    rootRelativePath,
    srcRelativePath,
};
