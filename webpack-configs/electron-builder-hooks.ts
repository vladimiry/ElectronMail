import {Configuration} from "webpack";
import fastGlob from "fast-glob";
import nodeExternals from "webpack-node-externals";
import path from "path";

import {buildBaseConfig, rootRelativePath, typescriptLoaderRule} from "./lib";
import {CONSOLE_LOG} from "scripts/lib";
import {sanitizeFastGlobPattern} from "src/shared/util/sanitize";

const hooksDir = rootRelativePath("./scripts/electron-builder");
const tsConfigFile = path.join(hooksDir, "tsconfig.json");

export default async (): Promise<Configuration[]> => {
    const hookSrcFiles = await fastGlob(
        sanitizeFastGlobPattern(`${hooksDir}/hook-*.ts`),
        {deep: 1, onlyFiles: true, stats: false},
    );

    CONSOLE_LOG(`Delected hook src files: ${JSON.stringify(hookSrcFiles, null, 2)}`);

    return hookSrcFiles.map((hookSrcFile) => {
        return buildBaseConfig({
            mode: "none",
            devtool: false,
            target: "node",
            entry: {[path.basename(hookSrcFile, ".ts")]: hookSrcFile},
            output: {path: hooksDir, libraryTarget: "commonjs2", libraryExport: "default", filename: "[name].cjs"},
            module: {rules: [typescriptLoaderRule({tsConfigFile})]},
            externals: [nodeExternals()],
            resolve: {alias: {scripts: rootRelativePath("scripts")}},
        }, {tsConfigFile});
    });
};
