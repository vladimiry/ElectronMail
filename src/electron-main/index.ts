import {app} from "electron";
import electronLog from "electron-log";

import {appReadyHandler} from "./bootstrap/app-ready";
import {bootstrapCommandLine} from "./bootstrap/command-line";
import {bootstrapInit} from "./bootstrap/init";
import {initContext} from "./context";
import {registerStandardSchemes} from "./protocol";
import {upgradeExistingConfig} from "./bootstrap/upgrade-config";

bootstrapInit();

// TODO consider sharing "Context" using dependency injection approach
const ctx = initContext();

bootstrapCommandLine(ctx);

registerStandardSchemes();

(async (): Promise<void> => {
    await (async (): Promise<void> => {
        // TODO test "logger.transports.file.level" update
        const {logLevel} = await ctx.configStore.read() ?? ctx.initialStores.config;
        electronLog.transports.file.level = logLevel;
    })();
    await upgradeExistingConfig(ctx);
    await app.whenReady(); // TODO setup timeout on "ready" even firing
    await appReadyHandler(ctx);
})().catch((error) => {
    console.error(error); // eslint-disable-line no-console
    electronLog.error(__filename, error);
    throw error;
});
