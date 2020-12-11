import electronLog from "electron-log";
import {app} from "electron";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {curryFunctionMembers} from "src/shared/util";
import {readConfigSync} from "src/electron-main/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/bootstrap/command-line]");

// WARN needs to be called before app is ready, function is synchronous
export function bootstrapCommandLine(ctx: Context): void {
    const config = readConfigSync(ctx);
    const jsFlags: import("ts-essentials").DeepPartial<Config>["jsFlags"]
        = config?.jsFlags ?? INITIAL_STORES.config().jsFlags;
    const commandLineSwitches: import("ts-essentials").DeepPartial<Config>["commandLineSwitches"]
        = config?.commandLineSwitches ?? INITIAL_STORES.config().commandLineSwitches;
    const disableGpuProcess: import("ts-essentials").DeepPartial<Config>["disableGpuProcess"]
        = config?.disableGpuProcess ?? INITIAL_STORES.config().disableGpuProcess;

    app.commandLine.appendSwitch("js-flags", jsFlags.join(" "));

    for (const commandLineSwitch of commandLineSwitches) {
        if (typeof commandLineSwitch === "string") {
            app.commandLine.appendSwitch(commandLineSwitch);
            continue;
        }

        if (Array.isArray(commandLineSwitch)) {
            const [name, value] = commandLineSwitch;

            if (
                typeof name !== "string"
                ||
                typeof value !== "string"
            ) {
                throw new Error(`Invalid "commandLineSwitches: name/value" pairs value detected`);
            }

            app.commandLine.appendSwitch(name, value);
        }

        throw new Error(`Invalid "commandLineSwitches" value detected`);
    }

    if (disableGpuProcess) {
        app.on("gpu-info-update", () => {
            logger.verbose("GPU features status:", JSON.stringify(app.getGPUFeatureStatus()));
        });

        // WARN just this call doesn't seem to completely disable the gpu process
        // see https://github.com/electron/electron/issues/14273
        app.disableHardwareAcceleration();
    }
}
