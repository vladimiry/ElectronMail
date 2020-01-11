import {Configuration} from "webpack";

import {buildBaseConfig, typescriptLoaderRule} from "webpack-configs/lib";

export function buildRendererConfig(entry: Configuration["entry"], tsConfigFile: string) {
    return buildBaseConfig(
        {
            target: "electron-renderer",
            entry,
            module: {
                rules: [
                    typescriptLoaderRule({tsConfigFile}),
                ],
            },
        },
        {
            tsConfigFile,
        },
    );
}
