import {app} from "electron";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";

// WARN needs to be called before app is ready, function is synchronous
export function bootstrapCommandLine(ctx: Context): void {
    let configFile: Buffer | string | undefined;

    try {
        // TODO add synchronous "read" method to "fs-json-store"
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        configFile = ctx.configStore.fs._impl.readFileSync(ctx.configStore.file); // eslint-disable-line @typescript-eslint/no-unsafe-call
    } catch (error) {
        if (error.code !== "ENOENT") { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
            throw error;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const {jsFlags = INITIAL_STORES.config().jsFlags}: Config = configFile
        ? JSON.parse(configFile.toString())
        : {};

    app.commandLine.appendSwitch("js-flags", jsFlags.join(" "));
}
