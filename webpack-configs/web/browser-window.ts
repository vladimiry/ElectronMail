import path from "path";
import {AngularCompilerPlugin, NgToolsLoader, PLATFORM} from "@ngtools/webpack";
import {CheatAngularCompilerResourcePlugin} from "webpack-dll-ng-module-loader/plugin";
import {DefinePlugin, DllReferencePlugin} from "webpack";

import {BuildAngularCompilationFlags, BuildEnvironment} from "webpack-configs/model";
import {ENVIRONMENT, ENVIRONMENT_STATE, outputRelativePath, rootRelativePath} from "webpack-configs/lib";
import {WEB_CHUNK_NAMES} from "src/shared/constants";
import {browserWindowAppPath, browserWindowPath, buildBaseWebConfig, cssRuleSetUseItems} from "./lib";

// tslint:disable:no-var-requires
// TODO import "@angular/compiler-cli" using ES6 import format on  https://github.com/angular/angular/issues/29220 resolving
const {readConfiguration} = require("@angular/compiler-cli");
// tslint:enable:no-var-requires

// TODO enable "ivy" and "aot" in all modes
const angularCompilationFlags: BuildAngularCompilationFlags = {
    aot: ENVIRONMENT_STATE.production,
    ivy: ENVIRONMENT_STATE.production,
    dllRef: ENVIRONMENT_STATE.development,
};

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
                    test: /[\/\\]@angular[\/\\].+\.js$/,
                    sideEffects: false,
                    parser: {
                        system: true,
                    },
                },
                {
                    test: /\.scss$/,
                    use: [
                        "to-string-loader",
                        ...cssRuleSetUseItems(),
                        "resolve-url-loader",
                        "sass-loader",
                    ],
                    include: [
                        browserWindowAppPath(),
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
            new DefinePlugin({
                BUILD_ANGULAR_COMPILATION_FLAGS: JSON.stringify(angularCompilationFlags),
            }),
            new AngularCompilerPlugin({
                contextElementDependencyConstructor: require("webpack/lib/dependencies/ContextElementDependency"),
                tsConfigPath: tsConfigFile,
                compilerOptions: {
                    preserveWhitespaces: false,
                    disableTypeScriptVersionCheck: true,
                    strictInjectionParameters: true,
                    // TODO ivy: get back templates type check after https://github.com/angular/angular/issues/30080 resolving
                    fullTemplateTypeCheck: false, // TODO ivy: angularCompilationFlags.aot || angularCompilationFlags.ivy
                    ivyTemplateTypeCheck: false, // TODO ivy: angularCompilationFlags.ivy
                    enableIvy: angularCompilationFlags.ivy,
                    ...readConfiguration(tsConfigFile).options,
                },
                platform: PLATFORM.Browser,
                skipCodeGeneration: !angularCompilationFlags.aot,
                nameLazyFiles: true,
                discoverLazyRoutes: true, // TODO disable "discoverLazyRoutes" once switched to Ivy renderer
                directTemplateLoading: false,
                entryModule: `${browserWindowAppPath("./app.module")}#AppModule`,
                additionalLazyModules: {
                    ["./_db-view/db-view.module#DbViewModule"]: browserWindowAppPath("./_db-view/db-view.module.ts"),
                },
            }),
        ],
        optimization: {
            splitChunks: {
                cacheGroups: {
                    commons: {
                        test: /[\\/]node_modules[\\/]|[\\/]vendor[\\/]/,
                        name: "vendor",
                        chunks: "all",
                    },
                },
            },
        },
    },
    {
        tsConfigFile,
        chunkName: WEB_CHUNK_NAMES["browser-window"],
    },
);

if (angularCompilationFlags.dllRef) {
    const dllOutputPath = outputRelativePath(`./web/${WEB_CHUNK_NAMES["browser-window-dll"]}/`);
    const dllOutputFileName = WEB_CHUNK_NAMES["browser-window-dll"];
    const dllOutputFileNameRelativeRequirePath = (() => {
        if (!config.output || !config.output.path) {
            throw new Error(`"config.output.path" is undefined`);
        }
        return path.join(
            path.relative(
                config.output.path,
                dllOutputPath,
            ),
            `${dllOutputFileName}.js`,
        );
    })();

    config.plugins = [
        new CheatAngularCompilerResourcePlugin(),

        ...(config.plugins || []),

        new DllReferencePlugin({
            context: config.context || process.cwd(),
            manifest: require(`${dllOutputPath}/${dllOutputFileName}-manifest.json`),
        }),

        new DefinePlugin({
            BUILD_ANGULAR_INJECT_DLL: JSON.stringify(dllOutputFileNameRelativeRequirePath),
        }),
    ];
} else {
    config.plugins = [
        ...(config.plugins || []),

        new DefinePlugin({
            BUILD_ANGULAR_INJECT_DLL: false,
        }),
    ];
}

export default config;
