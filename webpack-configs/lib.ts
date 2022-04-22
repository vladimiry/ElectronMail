import fsExtra from "fs-extra";
import {mapValues} from "remeda";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import {Options as TsLoaderOptions} from "ts-loader";
import webpack, {Configuration, RuleSetRule} from "webpack";
import {merge as webpackMerge} from "webpack-merge";

import {BuildEnvVars} from "./model";
import {CONSOLE_LOG} from "scripts/lib";

export const ENVIRONMENT: BuildEnvVars["BUILD_ENVIRONMENT"] = (
    () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const NODE_ENV = process.env.NODE_ENV as Exclude<BuildEnvVars["BUILD_ENVIRONMENT"], "production"> | undefined;
        return NODE_ENV === "development" || NODE_ENV === "test" || NODE_ENV === "e2e"
            ? NODE_ENV
            : "production";
    }
)();

export const ENVIRONMENT_STATE: Readonly<Record<BuildEnvVars["BUILD_ENVIRONMENT"], boolean>> = {
    production: ENVIRONMENT === "production",
    development: ENVIRONMENT === "development",
    test: ENVIRONMENT === "test",
    e2e: ENVIRONMENT === "e2e",
};

export const rootRelativePath = (...value: string[]): string => {
    return path.join(process.cwd(), ...value);
};

export const srcRelativePath = (...value: string[]): string => {
    return rootRelativePath("./src", ...value);
};

export const outputRelativePath = (...value: string[]): string => {
    return rootRelativePath(ENVIRONMENT_STATE.development ? "./app-dev" : "./app", ...value);
};

export const resolveExistingFile = (file: string): string => {
    const result = path.join(file);
    if (!fsExtra.pathExistsSync(result)) {
        throw new Error(`File "${file}" doesn't exist`);
    }
    return result;
};

const definePluginValue = mapValues(
    {
        BUILD_ENVIRONMENT: ENVIRONMENT,
        ...((): StrictOmit<BuildEnvVars, "BUILD_ENVIRONMENT"> => {
            return {
                BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE: process.env.ELECTRON_MAIL_BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE ?? false,
                BUILD_DISABLE_START_HIDDEN_FEATURE: process.env.ELECTRON_MAIL_BUILD_DISABLE_START_HIDDEN_FEATURE ?? false,
                BUILD_START_MAXIMIZED_BY_DEFAULT: process.env.ELECTRON_MAIL_BUILD_START_MAXIMIZED_BY_DEFAULT ?? false,
            };
        })(),
    },
    (value) => JSON.stringify(value),
);

CONSOLE_LOG("Injected environment variables:", definePluginValue);

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
                new webpack.DefinePlugin(definePluginValue),
            ],
            resolve: {
                extensions: ["*", ".js", ".ts"],
                alias: {
                    "src": srcRelativePath(),
                    "package.json": rootRelativePath("package.json"),
                },
            },
            optimization: {
                chunkIds: "named",
                moduleIds: "named",
                minimize: true,
                minimizer: [
                    // intentionally configured to only remove dead code (tree-shaking) and beautify it, not for the compression
                    new TerserPlugin({
                        terserOptions: {
                            // ecma: 2020,
                            mangle: false,
                            compress: {
                                dead_code: true,
                                defaults: false,
                                unused: true,
                            },
                            format: {
                                beautify: true,
                                comments: false,
                                indent_level: 2,
                            },
                        },
                    }),
                ],
            },
            node: {
                __filename: true,
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
