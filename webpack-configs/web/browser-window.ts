import {AngularCompilerPlugin, NgToolsLoader, PLATFORM} from "@ngtools/webpack";
import {readConfiguration} from "@angular/compiler-cli";

import {BuildAngularCompilationFlags, BuildEnvironment} from "webpack-configs/model";
import {ENVIRONMENT, rootRelativePath} from "webpack-configs/lib";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/webpack-conts";
import {browserWindowAppPath, browserWindowPath, buildBaseWebConfig, cssRuleSetRules} from "./lib";

const angularCompilationFlags: BuildAngularCompilationFlags = {aot: true, ivy: true};

const tsConfigFile = browserWindowPath(({
    production: "./tsconfig.json",
    development: "./tsconfig.development.json",
    test: "./test/tsconfig.json",
} as Record<BuildEnvironment, string>)[ENVIRONMENT]);

const config = buildBaseWebConfig(
    {
        module: {
            rules: [
                {
                    test: angularCompilationFlags.aot
                        ? /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/
                        : /\.ts$/,
                    use: [
                        "@angular-devkit/build-optimizer/webpack-loader",
                        NgToolsLoader,
                    ],
                },
                {
                    test: /[/\\]@angular[/\\].+\.js$/,
                    sideEffects: false,
                    parser: {
                        system: true,
                    },
                },
                {
                    test: /\.scss$/,
                    use: [
                        "to-string-loader",
                        ...cssRuleSetRules(),
                        "resolve-url-loader",
                        "sass-loader",
                    ],
                    include: [
                        browserWindowAppPath("/"),
                    ],
                },
                {
                    test: require.resolve("monaco-editor/esm/vs/base/common/platform.js"),
                    use: [
                        {
                            loader: "imports-loader",
                            options: {
                                additionalCode: `
                                    const self = {
                                        MonacoEnvironment: {
                                            getWorkerUrl(...[, label]) {
                                                if (label === "json") {
                                                    return "./json.worker.js";
                                                }
                                                if (label === "css" || label === "scss" || label === "less") {
                                                    return "./css.worker.js";
                                                }
                                                if (label === "html" || label === "handlebars" || label === "razor") {
                                                    return "./html.worker.js";
                                                }
                                                if (label === "typescript" || label === "javascript") {
                                                    return "./ts.worker.js";
                                                }
                                                return "./editor.worker.js";
                                            },
                                        },
                                    };
                                `,
                            },
                        },
                    ],
                },
            ],
        },
        resolve: {
            alias: {
                images: rootRelativePath("images"),
            },
        },
        plugins: [
            (() => {
                type StrictTemplateOptions
                    = NoExtraProps<Required<import("@angular/compiler-cli/src/ngtsc/core/api").StrictTemplateOptions>>;
                const strictTemplateOptions: NoExtraProps<Pick<StrictTemplateOptions, "strictTemplates">> = {
                    // if "true", implies all template strictness flags below (unless individually disabled)
                    // see https://angular.io/guide/template-typecheck
                    strictTemplates: angularCompilationFlags.ivy,
                };

                type LegacyNgcOptions
                    = NoExtraProps<Required<Pick<import("@angular/compiler-cli/src/ngtsc/core/api").LegacyNgcOptions,
                    | "fullTemplateTypeCheck"
                    | "strictInjectionParameters">>>;
                const legacyNgcOptions: LegacyNgcOptions = {
                    fullTemplateTypeCheck: angularCompilationFlags.aot || angularCompilationFlags.ivy,
                    strictInjectionParameters: true,
                };

                type AngularCompilerPluginOptions
                    = NoExtraProps<import("@ngtools/webpack/src/interfaces").AngularCompilerPluginOptions>;
                const compilerOptions: StrictOmit<Required<AngularCompilerPluginOptions>["compilerOptions"],
                    // skipping raw "string" props
                    Extract<keyof Required<AngularCompilerPluginOptions>["compilerOptions"], string>> = {
                    preserveWhitespaces: false,
                    disableTypeScriptVersionCheck: true,
                    enableIvy: angularCompilationFlags.ivy,
                    ...legacyNgcOptions,
                    ...strictTemplateOptions,
                    ...readConfiguration(tsConfigFile).options,
                };

                /* eslint-disable max-len */
                // https://github.com/angular/angular-devkit-build-angular-builds/blob/e8499b649475ae03b1519f181b982ce568b86c49/src/webpack/configs/typescript.js
                // https://github.com/angular/ngtools-webpack-builds/blob/4ee7f6f5d3f611ad29832bd27e984f1a46a99421/README.md
                // https://github.com/angular/angular-cli/blob/9980f8139cfcdd2a8e928a3a93b7af455ba25ea4/packages/ngtools/webpack/README.md
                // eslint-disable-next-line max-len
                const angularCompilerPluginOptions: AngularCompilerPluginOptions = {
                    // contextElementDependencyConstructor: require("webpack/lib/dependencies/ContextElementDependency"),
                    tsConfigPath: tsConfigFile,
                    compilerOptions,
                    platform: PLATFORM.Browser,
                    skipCodeGeneration: !angularCompilationFlags.aot,
                    nameLazyFiles: true,
                    discoverLazyRoutes: true, // TODO disable "discoverLazyRoutes" once switched to Ivy renderer
                    directTemplateLoading: false,
                    entryModule: `${browserWindowAppPath("./app.module")}#AppModule`,
                };

                return new AngularCompilerPlugin(angularCompilerPluginOptions);
            })(),
        ],
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
                    ...Object
                        .entries(
                            {
                                "shared-vendor-dark": "browser-window/vendor/shared-vendor-dark.scss",
                                "shared-vendor-light": "browser-window/vendor/shared-vendor-light.scss",
                                "vendor-dark": "browser-window/vendor/vendor-dark.scss",
                                "vendor-light": "browser-window/vendor/vendor-light.scss",
                                "app-theming-dark": "browser-window/app-theming-dark.scss",
                                "app-theming-light": "browser-window/app-theming-light.scss",
                            } as const,
                        )
                        .reduce(
                            (accumulator, [name, value]) => {
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
                            },
                            {},
                        ),
                },
            },
        },
    },
    {
        tsConfigFile,
        chunkName: WEBPACK_WEB_CHUNK_NAMES["browser-window"],
        entries: {
            "css.worker": "monaco-editor/esm/vs/language/css/css.worker",
            "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
            "html.worker": "monaco-editor/esm/vs/language/html/html.worker",
            "json.worker": "monaco-editor/esm/vs/language/json/json.worker",
            "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker",
        },
        htmlWebpackPlugin: {
            // TODO enable resource ordering via the HtmlWebpackPlugin/MiniCssExtractPlugin options
            inject: false,
        },
    },
);

export default config;
