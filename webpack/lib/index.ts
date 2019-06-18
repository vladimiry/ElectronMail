import path from "path";
import webpackMerge from "webpack-merge";
import webpack, {Configuration, RuleSetRule} from "webpack";
import {TsconfigPathsPlugin} from "tsconfig-paths-webpack-plugin";

import {BuildEnvironment} from "src/shared/model/common";
import {LoaderConfig as TsLoaderConfig} from "awesome-typescript-loader/src/interfaces";

const NODE_ENV = String(process.env.NODE_ENV);

export const ENVIRONMENT: BuildEnvironment = NODE_ENV === "development" || NODE_ENV === "test" ? NODE_ENV : "production";

export const ENVIRONMENT_SATE = {
    production: ENVIRONMENT === "production",
    development: ENVIRONMENT === "development",
    test: ENVIRONMENT === "test",
} as const;

// tslint:disable-next-line:no-console
console.log("BuildEnvironment:", ENVIRONMENT);

export const rootRelativePath = (...value: string[]) => path.join(process.cwd(), ...value);

export const srcRelativePath = (...value: string[]) => rootRelativePath("./src", ...value);

export const outputRelativePath = (...value: string[]) => rootRelativePath(ENVIRONMENT_SATE.development ? "./app-dev" : "./app", ...value);

export function buildBaseConfig(config: Configuration, options?: { tsConfigFile?: string }): Configuration {
    const {tsConfigFile} = {tsConfigFile: rootRelativePath("./tsconfig.json"), ...options};

    return webpackMerge(
        {
            mode: "production",
            devtool: false,
            output: {
                path: outputRelativePath(),
            },
            plugins: [
                new webpack.DefinePlugin({
                    "process.env.NODE_ENV": JSON.stringify(ENVIRONMENT),
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
}

export function awesomeTypescriptLoaderRule({tsConfigFile}: { tsConfigFile: string }): RuleSetRule {
    return {
        test: /\.ts$/,
        use: {
            loader: "awesome-typescript-loader",
            options: {
                configFileName: tsConfigFile,
            } as TsLoaderConfig,
        },
    };
}
