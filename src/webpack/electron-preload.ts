import glob from "glob";
import webpack, {Entry, EntryFunc} from "webpack";
import webpackMerge from "webpack-merge";

import {buildBaseConfig, environment, outputPath, rootPath, srcPath} from "./lib";

const configs = [
    buildRendererConfig(
        {
            "electron-preload/browser-window": srcPath(`./electron-preload/browser-window/build-env-based/${environment}.ts`),
            "electron-preload/browser-window-e2e": srcPath("./electron-preload/browser-window/e2e.ts"),
        },
        srcPath("./electron-preload/browser-window/tsconfig.json"),
    ),

    buildRendererConfig(
        {
            "electron-preload/webview/protonmail/index": srcPath("./electron-preload/webview/protonmail/index.ts"),
        },
        srcPath("./electron-preload/webview/protonmail/tsconfig.json"),
    ),

    (() => {
        const tutanotaSrcPath = (...value: string[]) => rootPath("./node_modules/tutanota/src", ...value);
        // tslint:disable-next-line:variable-name
        const resolveTypeReference_functionPatch = {
            test: tutanotaSrcPath("./api/common/EntityFunctions.js"),
            options: {
                // tslint:disable:max-line-length
                search: "return asyncImport(typeof module != \"undefined\" ? module.id : __moduleName, `${pathPrefix}src/api/entities/${typeRef.app}/${typeRef.type}.js`)",
                // TODO no need to include all the entities
                // @formatter:off
                replace: `
                    return new Promise((resolve, reject) => {
                        try {
                            const entities = ${JSON.stringify(
                                // tslint:disable-next-line:max-line-length
                                glob.sync("**/*.js", {cwd: tutanotaSrcPath("./api/entities")}).reduce((accumulator, item) => {
                                    accumulator[item] = `require('../entities/${item}')`;
                                    return accumulator;
                                }, {} as Record<string, string>),
                                null,
                                4,
                            ).replace(/:\s"(require.*)"/g, ": $1")};
                            const entity = entities[\`${"${typeRef.app}/${typeRef.type}.js"}\`];
                            resolve(entity);
                        } catch (e) {
                            reject (e);
                        }
                    })
                `,
                // tslint:enable:max-line-length
                // @formatter:on
                strict: true,
            },
        };
        const config = buildRendererConfig(
            {
                index: srcPath("./electron-preload/webview/tutanota/index.ts"),
            },
            srcPath("./electron-preload/webview/tutanota/tsconfig.json"),
        );

        return webpackMerge(
            config,
            {
                output: {
                    path: outputPath("./electron-preload/webview/tutanota"),
                },
                module: {
                    rules: [
                        {
                            test: /\.js?$/,
                            enforce: "pre",
                            use: "remove-flow-types-loader",
                            include: tutanotaSrcPath(),
                        },
                        {
                            test: resolveTypeReference_functionPatch.test,
                            enforce: "pre",
                            loader: "string-replace-loader",
                            options: resolveTypeReference_functionPatch.options,
                            include: tutanotaSrcPath(),
                        },
                    ],
                },
                optimization: {
                    concatenateModules: true,
                },
                plugins: [
                    new webpack.DefinePlugin({
                        "env.rootPathPrefix": JSON.stringify(""),
                        "env.adminTypes": JSON.stringify([]),
                    }),
                ],
            },
        );
    }),
];

export default configs;

function buildRendererConfig(entry: string | string[] | Entry | EntryFunc, tsConfigFile: string) {
    return buildBaseConfig(
        {
            target: "electron-renderer",
            entry,
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
        },
        {
            tsConfigFile,
        },
    );
}
