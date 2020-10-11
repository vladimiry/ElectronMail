import path from "path";
import {Configuration, DefinePlugin, RuleSetRule} from "webpack";
import {Options as TsLoaderOptions} from "ts-loader";
import {merge as webpackMerge} from "webpack-merge";

import {BuildEnvironment} from "./model";
import {CONSOLE_LOG} from "scripts/lib";

export const ENVIRONMENT: BuildEnvironment = (
    () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const NODE_ENV = process.env.NODE_ENV as Exclude<BuildEnvironment, "production"> | undefined;
        return NODE_ENV === "development" || NODE_ENV === "test"
            ? NODE_ENV
            : "production";
    }
)();

export const ENVIRONMENT_STATE: Readonly<Record<BuildEnvironment, boolean>> = {
    production: ENVIRONMENT === "production",
    development: ENVIRONMENT === "development",
    test: ENVIRONMENT === "test",
};

CONSOLE_LOG("BuildEnvironment: ", ENVIRONMENT);

export const rootRelativePath = (...value: string[]): string => {
    return path.join(process.cwd(), ...value);
};

export const srcRelativePath = (...value: string[]): string => {
    return rootRelativePath("./src", ...value);
};

export const outputRelativePath = (...value: string[]): string => {
    return rootRelativePath(ENVIRONMENT_STATE.development ? "./app-dev" : "./app", ...value);
};

export function buildBaseConfig(
    ...[config]: readonly [Configuration] | readonly [Configuration, { tsConfigFile?: string }]
): Configuration {
    return webpackMerge(
        {
            watch: Boolean(
                Number(process.env.WEBPACK_ENV_WATCH),
            ),
            mode: "production",
            devtool: false,
            output: {
                path: outputRelativePath(),
            },
            plugins: [
                new DefinePlugin({
                    BUILD_ENVIRONMENT: JSON.stringify(ENVIRONMENT),
                }),
            ],
            resolve: {
                extensions: ["*", ".js", ".ts"],
                alias: {
                    "src": srcRelativePath(),
                    "package.json": rootRelativePath("package.json"),
                },
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

export function typescriptLoaderRule({tsConfigFile}: { tsConfigFile: string }): RuleSetRule {
    const options: Partial<TsLoaderOptions> = {
        configFile: tsConfigFile,
    };
    return {
        test: /\.ts$/,
        use: {
            loader: "ts-loader",
            options,
        },
    };
}
