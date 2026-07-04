import {app} from "electron";
import type {DeepPartial} from "ts-essentials";

import type {Config} from "src/shared/model/options";
import type {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {readConfigSync} from "src/electron-main/util";

// WARN needs to be called before app is ready, function is synchronous
export function bootstrapCommandLine(ctx: Context): void {
    const config = readConfigSync(ctx);
    const jsFlags: DeepPartial<Config>["jsFlags"] = config?.jsFlags ?? INITIAL_STORES.config().jsFlags;
    const commandLineSwitches: DeepPartial<Config>["commandLineSwitches"] = config?.commandLineSwitches
        ?? INITIAL_STORES.config().commandLineSwitches;

    if (jsFlags.length) {
        app.commandLine.appendSwitch("js-flags", jsFlags.join(" "));
    }

    for (const commandLineSwitch of commandLineSwitches) {
        const args: readonly unknown[] | null = typeof commandLineSwitch === "string"
            ? [commandLineSwitch]
            : (Array.isArray(commandLineSwitch)
                ? commandLineSwitch
                : null);

        if (!args) {
            throw new Error(`Invalid "commandLineSwitch" value detected`);
        }

        const [switchNameParamArg, switchValueArg] = args;

        if (
            typeof switchNameParamArg !== "string"
            || (typeof switchValueArg !== "string" && typeof switchValueArg !== "undefined")
        ) {
            throw new Error(`Invalid "commandLineSwitch" name/value detected`);
        }

        {
            const appendSwitchArgs: [the_switch: string, value?: string] = typeof switchValueArg === "string"
                ? [switchNameParamArg, switchValueArg]
                : [switchNameParamArg];
            app.commandLine.appendSwitch(...appendSwitchArgs);
        }
    }
}
