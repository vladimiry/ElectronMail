import fastGlob from "fast-glob";
import {mapValues} from "remeda";
import nodeExternals from "webpack-node-externals";
import path from "path";
import webpack, {Configuration} from "webpack";

import {buildBaseConfig, rootRelativePath, typescriptLoaderRule} from "./lib";
import {CONSOLE_LOG} from "scripts/lib";
import {sanitizeFastGlobPattern} from "src/shared/util/sanitize";

const hooksDir = rootRelativePath("./scripts/electron-builder");
const tsConfigFile = path.join(hooksDir, "tsconfig.json");

export default async (): Promise<Configuration[]> => {
    const fileNamePrefix = "hook-";
    const srcFilesScanPattern = `${hooksDir}/${fileNamePrefix}*.ts`;
    const hookSrcFiles = await fastGlob(
        sanitizeFastGlobPattern(srcFilesScanPattern),
        {deep: 1, onlyFiles: true, stats: false},
    );

    CONSOLE_LOG(`Delected hook src files: ${JSON.stringify(hookSrcFiles, null, 2)}`);

    const configs = hookSrcFiles.map((hookSrcFile) => {
        const entryKey = path.basename(hookSrcFile, ".ts");
        const hookName = toCamelCase(entryKey.split(fileNamePrefix).pop()!);
        const definePluginValue = mapValues(
            {BUILD_HOOK_NAME: hookName, BUILD_HOOK_HOOK_PRINT_PREFIX: `[hook: ${hookName}]`},
            (value) => JSON.stringify(value),
        );

        CONSOLE_LOG("Injected environment variables:", definePluginValue);

        return buildBaseConfig({
            mode: "none",
            devtool: false,
            target: "node",
            entry: {[entryKey]: hookSrcFile},
            output: {path: hooksDir, libraryTarget: "commonjs2", libraryExport: "default", filename: "[name].cjs"},
            module: {rules: [typescriptLoaderRule({tsConfigFile})]},
            externals: [nodeExternals()],
            resolve: {alias: {scripts: rootRelativePath("scripts")}},
            plugins: [new webpack.DefinePlugin(definePluginValue)],
        }, {tsConfigFile});
    });

    if (!configs.length) {
        CONSOLE_LOG(`Hooks source files not resolved by the "${srcFilesScanPattern}" pattern, skipping the respective Webpack build ...`);
        process.exit(0);
    }

    return configs;
};

function toCamelCase(str: string): string {
    return str.replace(/[-_\s]+(.)?/g, (_, char: string | undefined) => char?.toUpperCase() ?? "");
}
