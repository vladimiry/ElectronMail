import {app} from "electron";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {readConfigSync} from "src/electron-main/util";

// WARN needs to be called before app is ready, function is synchronous
export function bootstrapCommandLine(ctx: Context): void {
    const config = readConfigSync(ctx);
    const {jsFlags}: Pick<Config, "jsFlags"> = config ?? INITIAL_STORES.config();

    app.commandLine.appendSwitch("js-flags", jsFlags.join(" "));
}
