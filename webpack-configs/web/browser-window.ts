import AngularBabelLinkerPlugin from "@angular/compiler-cli/linker/babel";
import {AngularWebpackPlugin, AngularWebpackPluginOptions} from "@ngtools/webpack";
import {CompilerOptions, readConfiguration} from "@angular/compiler-cli";

import {browserWindowAppPath, browserWindowPath, buildBaseWebConfig, cssRuleSetRules, sassLoaderRuleSetRules} from "./lib";
import {BuildAngularCompilationFlags, BuildEnvVars} from "webpack-configs/model";
import {buildBaseConfig, ENVIRONMENT, outputRelativePath, rootRelativePath} from "webpack-configs/lib";
import {MONACO_EDITOR_ASSETS_SUBFOLDER, WEBPACK_WEB_CHUNK_NAMES} from "src/shared/const/webpack";

const angularCompilationFlags: BuildAngularCompilationFlags = {aot: true, ivy: true};

const chunkName = WEBPACK_WEB_CHUNK_NAMES["browser-window"];

const monacoEditorWorkers = {
    editor: {
        src: rootRelativePath("./node_modules/monaco-editor/esm/vs/editor/editor.worker.js"),
        asset: "monaco-editor-worker",
    },
    ts: {
        src: rootRelativePath("./node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js"),
        asset: "monaco-editor-ts-worker",
    },
} as const;

const tsConfigFile = browserWindowPath(
    ({production: "./tsconfig.json", development: "./tsconfig.development.json", test: "./test/tsconfig.json"} as Record<
        BuildEnvVars["BUILD_ENVIRONMENT"],
        string
    >)[ENVIRONMENT],
);

const mainWebpackConfig = buildBaseWebConfig({
    module: {
        rules: [
            // monaco
            ...(() => [
                ...Object.entries(monacoEditorWorkers).map(([, {src, asset}]) => ({
                    test: src,
                    use: {
                        loader: "string-loader",
                        options: {
                            // making sure monaco workers don't get embeded into the bundle
                            content: `export default function(){throw new Error('"${asset}" not bundled');}`,
                        },
                    },
                })),
                {
                    test: rootRelativePath("./node_modules/monaco-editor/esm/vs/base/common/platform.js"),
                    use: [{
                        loader: "imports-loader",
                        options: {
                            additionalCode: `
                            self.MonacoEnvironment = {
                                getWorkerUrl: function(...[/* moduleId */, label]) {
                                    if (label === "typescript" || label === "javascript") {
                                        return "./${MONACO_EDITOR_ASSETS_SUBFOLDER}/${monacoEditorWorkers.ts.asset}.mjs";
                                    }
                                    return "./${MONACO_EDITOR_ASSETS_SUBFOLDER}/${monacoEditorWorkers.editor.asset}.mjs";
                                },
                            };
                        `,
                        },
                    }],
                },
            ])(),
            // angular
            ...(() => [
                {
                    test: /\.m?[j|t]s$/,
                    use: {
                        loader: "babel-loader",
                        options: {
                            cacheDirectory: true,
                            compact: false,
                            plugins: [
                                AngularBabelLinkerPlugin,
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
                {
                    test: /\.[jt]sx?$/,
                    loader: "@ngtools/webpack",
                },
                {
                    test: /\.scss$/,
                    use: ["to-string-loader", ...cssRuleSetRules(), "resolve-url-loader", ...sassLoaderRuleSetRules],
                    include: [browserWindowAppPath("/")],
                },
            ])(),
        ],
    },
    resolve: {
        alias: {
            images: rootRelativePath("images"),
        },
    },
    plugins: [
        (() => {
            const typeCheckingOptions: NoExtraProps<
                Pick<NoExtraProps<Required<CompilerOptions>>, "strictTemplates">
            > = {
                // Unless otherwise commented, each "TypeCheckingOptions" option is set to the value for "strictTemplates" ("true" when
                // "strictTemplates" is "true" and conversely, the other way around).
                // See https://angular.io/guide/template-typecheck for details.
                strictTemplates: angularCompilationFlags.ivy,
            };
            const legacyNgcOptions: NoExtraProps<Required<Pick<CompilerOptions, "fullTemplateTypeCheck" | "strictInjectionParameters">>> = {
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
                ...typeCheckingOptions,
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
        })(),
    ],
    optimization: {
        splitChunks: {
            cacheGroups: {
                monaco: {
                    test: /[\\/]node_modules[\\/]monaco-editor[\\/]/,
                    name: `${MONACO_EDITOR_ASSETS_SUBFOLDER}/monaco`,
                    priority: 20,
                },
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    priority: -10,
                    filename: ({chunk}) => `vendor_${chunk?.hash}.js`,
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
    chunkName,
    htmlWebpackPlugin: {
        // TODO enable resource ordering via the HtmlWebpackPlugin/MiniCssExtractPlugin options (dark/light theming matter)
        inject: false,
    },
});

const monacoWorkersWebpackConfig = buildBaseConfig({
    target: "web",
    experiments: {outputModule: true},
    output: {
        path: outputRelativePath("./web", chunkName, MONACO_EDITOR_ASSETS_SUBFOLDER),
        publicPath: "auto",
        libraryTarget: "module",
    },
    entry: {
        [monacoEditorWorkers.editor.asset]: monacoEditorWorkers.editor.src,
        [monacoEditorWorkers.ts.asset]: monacoEditorWorkers.ts.src,
    },
});

export default [
    mainWebpackConfig,
    monacoWorkersWebpackConfig,
];
