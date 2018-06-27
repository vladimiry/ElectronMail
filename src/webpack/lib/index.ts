import path from "path";
import webpack, {Configuration} from "webpack";
import webpackMerge from "webpack-merge";
import {BuildEnvironment} from "_@shared/model/common";
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

const rootPath = (...value: string[]) => path.join(process.cwd(), ...value);
const srcPath = (...value: string[]) => rootPath("./src", ...value);
const outputPath = (...value: string[]) => rootPath(environmentSate.development ? "./app-dev" : "./app", ...value);

// tslint:disable:no-var-requires
const packageJson = require(rootPath("./package.json"));

const buildConfig: BuildConfig = (config, options = {}) => {
    const {tsConfigFile} = {tsConfigFile: rootPath("./tsconfig.json"), ...options};

    return webpackMerge(
        {
            mode: environmentSate.development || environmentSate.test ? "development" : "production",
            devtool: environmentSate.production ? false : "source-map",
            output: {path: outputPath()},
            plugins: [
                new webpack.DefinePlugin({
                    "process.env.NODE_ENV": JSON.stringify(environment),
                    "process.env.APP_ENV_PACKAGE_NAME": JSON.stringify(packageJson.name),
                    "process.env.APP_ENV_PACKAGE_DESCRIPTION": JSON.stringify(packageJson.description),
                    "process.env.APP_ENV_PACKAGE_BUGS_URL": JSON.stringify(packageJson.bugs.url),
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
        config,
    );
};

export {
    buildConfig,
    environment,
    environmentSate,
    outputPath,
    rootPath,
    srcPath,
};
