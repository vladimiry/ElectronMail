import electronUnhandled from "electron-unhandled";
import logger from "electron-log";
import {app} from "electron";

import {APP_NAME} from "src/shared/constants";
import {Config} from "src/shared/model/options";
import {INITIAL_STORES} from "src/electron-main/constants";
import {initApi} from "./api";
import {initApplicationMenu} from "./menu";
import {initAutoUpdate} from "./app-update";
import {initBrowserWindow} from "./window";
import {initContext} from "./util";
import {initDefaultSession} from "./session";
import {initTray} from "./tray";
import {initWebContentsCreatingHandlers} from "./web-contents";
import {initWebRequestListeners} from "./web-request";

electronUnhandled({
    logger: logger.error,
    showDialog: true,
});

if (!app.requestSingleInstanceLock()) {
    // calling app.exit() instead of app.quit() in order to prevent "Error: Cannot find module ..." error happening
    // https://github.com/electron/electron/issues/8862
    app.exit();
}

// needed for desktop notifications properly working on Win 10, details https://www.electron.build/configuration/nsis
app.setAppUserModelId(`com.github.vladimiry.${APP_NAME}`);

// TODO consider sharing "Context" using dependency injection approach
const ctx = initContext();

// WARN needs to be called before app is ready, so synchronous mode
// TODO add synchronous "read" method to "fs-json-store"
(() => {
    let configFile: Buffer | string | undefined;

    try {
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
})();

app.on("ready", async () => {
    await initDefaultSession(ctx);

    initWebRequestListeners(ctx);

    const endpoints = await initApi(ctx);
    const {checkForUpdatesAndNotify} = await endpoints.readConfig().toPromise();

    initWebContentsCreatingHandlers(ctx);

    ctx.uiContext = {
        browserWindow: await initBrowserWindow(ctx, endpoints),
        tray: initTray(endpoints),
        appMenu: await initApplicationMenu(endpoints),
    };

    await endpoints.updateOverlayIcon({hasLoggedOut: false, unread: 0}).toPromise();

    if (checkForUpdatesAndNotify && ctx.runtimeEnvironment !== "e2e") {
        initAutoUpdate();
    }

    app.on("second-instance", async () => {
        await endpoints.activateBrowserWindow().toPromise();
    });

    app.on("activate", async () => {
        await endpoints.activateBrowserWindow();
    });
});
