import {AngularWebpackPlugin, AngularWebpackPluginOptions} from "@ngtools/webpack";
import {LegacyNgcOptions, StrictTemplateOptions} from "@angular/compiler-cli/src/ngtsc/core/api";
import linkerPlugin from "@angular/compiler-cli/linker/babel";
import {readConfiguration} from "@angular/compiler-cli";

import {browserWindowAppPath, browserWindowPath, buildBaseWebConfig, cssRuleSetRules, sassLoaderRuleSetRules} from "./lib";
import {BuildAngularCompilationFlags, BuildEnvVars} from "webpack-configs/model";
import {ENVIRONMENT, rootRelativePath} from "webpack-configs/lib";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/const/webpack";

const angularCompilationFlags: BuildAngularCompilationFlags = {aot: true, ivy: true};

const tsConfigFile = browserWindowPath(
    ({production: "./tsconfig.json", development: "./tsconfig.development.json", test: "./test/tsconfig.json"} as Record<
        BuildEnvVars["BUILD_ENVIRONMENT"],
        string
    >)[ENVIRONMENT],
);

const config = buildBaseWebConfig({
    module: {
        rules: [
            // { // see https://github.com/angular/angular/issues/44026
            //     test: /\.m?js$/,
            //     exclude: [
            //         rootRelativePath("./node_modules/monaco-editor"),
            //     ],
            //     use: {
            //         loader: "babel-loader",
            //         options: {
            //             cacheDirectory: true,
            //             plugins: [linkerPlugin],
            //         },
            //     }
            // },
            {
                test: /\.m?[j|t]s$/,
                use: {
                    loader: "babel-loader",
                    options: {
                        cacheDirectory: true,
                        compact: false,
                        plugins: [
                            linkerPlugin,
                            "@babel/plugin-syntax-import-assertions",
                            // always transform async/await to support zone.js thing
                            "@babel/plugin-transform-async-generator-functions",
                            "@babel/plugin-transform-async-to-generator",
                            // babel's equivalent to typescript's "importHelpers" option
                            "@babel/plugin-transform-runtime",
                        ],
                    },
                },
            },
            {test: /\.[jt]sx?$/, loader: "@ngtools/webpack"},
            {
                test: /\.scss$/,
                use: ["to-string-loader", ...cssRuleSetRules(), "resolve-url-loader", ...sassLoaderRuleSetRules],
                include: [browserWindowAppPath("/")],
            },
            {
                test: rootRelativePath("./node_modules/monaco-editor/esm/vs/base/common/platform.js"),
                use: [{
                    loader: "imports-loader",
                    options: {
                        additionalCode: `
                                    const self = {
                                        MonacoEnvironment: {
                                            getWorker(...[/* workerId */, label]) {
                                                return new Worker(
                                                    ["typescript", "javascript"].includes(label)
                                                        ? "./monaco-editor.ts.worker.mjs"
                                                        : "./monaco-editor.editor.worker.mjs",
                                                    { name: label, type: "module" },
                                                );
                                            },
                                        },
                                    };
                                `,
                    },
                }],
            },
        ],
    },
    resolve: {alias: {images: rootRelativePath("images")}},
    plugins: [(() => {
        const strictTemplateOptions: NoExtraProps<Pick<NoExtraProps<Required<StrictTemplateOptions>>, "strictTemplates">> = {
            // if "true", implies all template strictness flags below (unless individually disabled)
            // see https://angular.io/guide/template-typecheck
            strictTemplates: angularCompilationFlags.ivy,
        };

        const legacyNgcOptions: NoExtraProps<Required<Pick<LegacyNgcOptions, "fullTemplateTypeCheck" | "strictInjectionParameters">>> = {
            fullTemplateTypeCheck: angularCompilationFlags.aot || angularCompilationFlags.ivy,
            strictInjectionParameters: true,
        };

        const compilerOptions: Omit<
            Required<AngularWebpackPluginOptions>["compilerOptions"],
            // skipping raw "string" props
            Extract<keyof Required<AngularWebpackPluginOptions>["compilerOptions"], string>
        > = {
            preserveWhitespaces: false,
            disableTypeScriptVersionCheck: true,
            ...legacyNgcOptions,
            ...strictTemplateOptions,
            ...readConfiguration(tsConfigFile).options,
        };

        const angularCompilerPluginOptions: NoExtraProps<AngularWebpackPluginOptions> = {
            tsconfig: tsConfigFile,
            compilerOptions,
            jitMode: !angularCompilationFlags.aot, // renamed from "skipCodeGeneration" since @angular v12
            directTemplateLoading: false,
            emitClassMetadata: false,
            emitNgModuleScope: false,
            substitutions: {},
            fileReplacements: {},
        };

        return new AngularWebpackPlugin(angularCompilerPluginOptions);
    })()],
    optimization: {
        splitChunks: {
            cacheGroups: {
                defaultVendors: false,
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    priority: -10,
                    filename({chunk}) {
                        if (!chunk?.hash) {
                            throw new Error(`Invalid "chunk.hash" value`);
                        }
                        return `vendor_${chunk.hash}.js`;
                    },
                },
                ...Object.entries(
                    {
                        "shared-vendor-dark": "browser-window/vendor/shared-vendor-dark.scss",
                        "shared-vendor-light": "browser-window/vendor/shared-vendor-light.scss",
                        "vendor-dark": "browser-window/vendor/vendor-dark.scss",
                        "vendor-light": "browser-window/vendor/vendor-light.scss",
                        "app-theming-dark": "browser-window/app-theming-dark.scss",
                        "app-theming-light": "browser-window/app-theming-light.scss",
                    } as const,
                ).reduce((accumulator, [name, value]) => {
                    return {
                        ...accumulator,
                        [`styles-${name}`]: {
                            // eslint-disable-next-line no-useless-escape
                            test: new RegExp(`src/web/${value}`.replace(/\//g, "(\|\\\\|/)"), "g"),
                            name,
                            chunks: "all",
                            enforce: true,
                        },
                    };
                }, {}),
            },
        },
    },
}, {
    tsConfigFile,
    chunkName: WEBPACK_WEB_CHUNK_NAMES["browser-window"],
    entries: {
        "monaco-editor.ts.worker": rootRelativePath("./node_modules/monaco-editor/esm/vs/language/typescript/ts.worker"),
        "monaco-editor.editor.worker": rootRelativePath("./node_modules/monaco-editor/esm/vs/editor/editor.worker.js"),
    },
    htmlWebpackPlugin: {
        // TODO enable resource ordering via the HtmlWebpackPlugin/MiniCssExtractPlugin options (dark/light theming matter)
        inject: false,
    },
});

export default config;
