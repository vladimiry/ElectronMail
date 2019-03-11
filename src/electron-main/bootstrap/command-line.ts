import {app} from "electron";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";

// WARN needs to be called before app is ready, function is synchronous
export function bootstrapCommandLine(ctx: Context) {
    let configFile: Buffer | string | undefined;

    try {
        // TODO add synchronous "read" method to "fs-json-store"
        configFile = ctx.configStore.fs._impl.readFileSync(ctx.configStore.file);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    const {
        disableGpuProcess,
        jsFlags = INITIAL_STORES.config().jsFlags,
    }: Config = configFile
        ? JSON.parse(configFile.toString())
        : {};

    app.commandLine.appendSwitch("js-flags", jsFlags.join(" "));

    (() => {
        if (!disableGpuProcess) {
            return;
        }
        // TODO just this call doesn't completely disable the gpu process, track https://github.com/electron/electron/issues/14273
        app.disableHardwareAcceleration();
        // app.commandLine.appendSwitch("disable-gpu"); // doesn't take an affect
        // app.commandLine.appendSwitch("in-process-gpu"); // app fails with this flag
        app.commandLine.appendSwitch("disable-software-rasterizer"); // seems to be taking some effect
    })();
}
