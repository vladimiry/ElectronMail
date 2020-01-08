import {Configuration} from "webpack";

import {awesomeTypescriptLoaderRule, buildBaseConfig} from "webpack-configs/lib";

export function buildRendererConfig(entry: Configuration["entry"], tsConfigFile: string) {
    return buildBaseConfig(
        {
            target: "electron-renderer",
            entry,
            module: {
                rules: [
                    awesomeTypescriptLoaderRule({tsConfigFile}),
                ],
            },
        },
        {
            tsConfigFile,
        },
    );
}
