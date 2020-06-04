import {app} from "electron";

import {Context} from "src/electron-main/model";
import {getDefaultSession, initSession} from "src/electron-main/session";
import {initApi} from "src/electron-main/api";
import {initApplicationMenu} from "src/electron-main/menu";
import {initMainBrowserWindow} from "src/electron-main/window/main";
import {initSpellCheckController} from "src/electron-main/spell-check/controller";
import {initTray} from "src/electron-main/tray";
import {initWebContentsCreatingHandlers} from "src/electron-main/web-contents";
import {registerWebFolderFileProtocol} from "src/electron-main/protocol";

export async function appReadyHandler(ctx: Context) {
    await registerWebFolderFileProtocol(ctx, getDefaultSession());

    await initSession(ctx, getDefaultSession());

    const endpoints = await initApi(ctx);

    // "endpoints.readConfig()" call initializes the config.json file
    // so consequent "ctx.configStore.readExisting()" calls don't fail
    const {spellCheckLocale, customTrayIconColor} = await endpoints.readConfig();

    await (async () => {
        const spellCheckController = await initSpellCheckController(spellCheckLocale);
        ctx.getSpellCheckController = () => spellCheckController;
    })();

    // TODO test "initWebContentsCreatingHandlers" called after "ctx.getSpellCheckController" got initialized
    await initWebContentsCreatingHandlers(ctx);

    ctx.uiContext = {
        browserWindow: await initMainBrowserWindow(ctx),
        tray: await initTray(ctx),
        appMenu: await initApplicationMenu(ctx),
    };

    await endpoints.updateOverlayIcon({hasLoggedOut: false, unread: 0, trayIconColor: customTrayIconColor});

    app.on("second-instance", async () => await endpoints.activateBrowserWindow());
    app.on("activate", async () => await endpoints.activateBrowserWindow());
}
