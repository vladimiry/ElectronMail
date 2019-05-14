import {app} from "electron";

import {Context} from "src/electron-main/model";
import {VOID} from "src/shared/constants";
import {getDefaultSession, initSession} from "src/electron-main/session";
import {initApi} from "src/electron-main/api";
import {initApplicationMenu} from "src/electron-main/menu";
import {initMainBrowserWindow} from "src/electron-main/window/main";
import {initTray} from "src/electron-main/tray";
import {initWebContentsCreatingHandlers} from "src/electron-main/web-contents";

export async function appReadyHandler(ctx: Context) {
    await initSession(ctx, getDefaultSession());

    const endpoints = await initApi(ctx);

    // initializing config.json file, so consequent "ctx.configStore.readExisting()" calls would not fails
    await endpoints.readConfig.call(VOID);

    initWebContentsCreatingHandlers(ctx);

    ctx.uiContext = {
        browserWindow: await initMainBrowserWindow(ctx),
        tray: await initTray(ctx),
        appMenu: await initApplicationMenu(ctx),
    };

    await endpoints.updateOverlayIcon.call(VOID, {hasLoggedOut: false, unread: 0});

    app.on("second-instance", async () => await endpoints.activateBrowserWindow.call(VOID));
    app.on("activate", async () => await endpoints.activateBrowserWindow.call(VOID));
}
