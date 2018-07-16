import path from "path";
import UglifyJsPlugin from "uglifyjs-webpack-plugin";
import webpack, {Configuration} from "webpack";
import webpackMerge from "webpack-merge";

import {BuildEnvironment} from "src/shared/model/common";
import {TsconfigPathsPlugin} from "tsconfig-paths-webpack-plugin";

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

const rootRelateivePath = (...value: string[]) => path.join(process.cwd(), ...value);
const srcRelateivePath = (...value: string[]) => rootRelateivePath("./src", ...value);
const outputRelateivePath = (...value: string[]) => rootRelateivePath(environmentSate.development ? "./app-dev" : "./app", ...value);

const buildBaseConfig: BuildConfig = (config, options = {}) => {
    const {tsConfigFile} = {tsConfigFile: rootRelateivePath("./tsconfig.json"), ...options};

    return webpackMerge(
        {
            mode: environmentSate.development || environmentSate.test ? "development" : "production",
            devtool: "source-map",
            output: {
                path: outputRelateivePath(),
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
        },
        environmentSate.development ? {
            optimization: {
                namedChunks: true,
                namedModules: true,
                minimizer: [
                    new UglifyJsPlugin({
                        uglifyOptions: {
                            compress: false,
                            mangle: false,
                            ecma: 7,
                            output: {
                                comments: true,
                                beautify: false,
                            },
                        },
                    }),
                ],
            },
        } : {},
        config,
    );
};

export {
    buildBaseConfig,
    environment,
    environmentSate,
    outputRelateivePath,
    rootRelateivePath,
    srcRelateivePath,
};
