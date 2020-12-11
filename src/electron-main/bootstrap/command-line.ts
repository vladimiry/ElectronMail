import type {DeepPartial} from "ts-essentials";
import {app} from "electron";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {readConfigSync} from "src/electron-main/util";

const appendSwitch = (args: readonly [switchName: string, switchValue?: string]): void => {
    app.commandLine.appendSwitch(...args);
};

// WARN needs to be called before app is ready, function is synchronous
export function bootstrapCommandLine(ctx: Context): void {
    const config = readConfigSync(ctx);
    const jsFlags: DeepPartial<Config>["jsFlags"]
        = config?.jsFlags ?? INITIAL_STORES.config().jsFlags;
    const commandLineSwitches: DeepPartial<Config>["commandLineSwitches"]
        = config?.commandLineSwitches ?? INITIAL_STORES.config().commandLineSwitches;

    if (jsFlags.length) {
        app.commandLine.appendSwitch("js-flags", jsFlags.join(" "));
    }

    for (const commandLineSwitch of commandLineSwitches) {
        const args: readonly unknown[] | null = typeof commandLineSwitch === "string"
            ? [commandLineSwitch]
            : Array.isArray(commandLineSwitch)
                ? commandLineSwitch
                : null;

        if (!args) {
            throw new Error(`Invalid "commandLineSwitch" value detected`);
        }

        const [switchNameParamArg, switchValueArg] = args;

        if (
            typeof switchNameParamArg !== "string"
            ||
            (
                typeof switchValueArg !== "string"
                &&
                typeof switchValueArg !== "undefined"
            )
        ) {
            throw new Error(`Invalid "commandLineSwitch" name/value detected`);
        }

        appendSwitch(
            typeof switchValueArg === "string"
                ? [switchNameParamArg, switchValueArg]
                : [switchNameParamArg]
        );
    }
}
