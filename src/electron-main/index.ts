import electronUnhandled from "electron-unhandled";
import logger from "electron-log";
import {WebContents, app} from "electron";

import {ACCOUNTS_CONFIG, ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX, APP_NAME} from "src/shared/constants";
import {EntryUrlItem} from "src/shared/types";
import {clearDefaultSessionCaches} from "./session";
import {initApi} from "./api";
import {initApplicationMenu} from "./menu";
import {initAutoUpdate} from "./app-update";
import {initBrowserWindow} from "./window";
import {initContext} from "./util";
import {initTray} from "./tray";
import {initWebContentContextMenu} from "./web-content-context-menu";
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

const ctx = initContext();

app.on("ready", async () => {
    await clearDefaultSessionCaches();

    initWebRequestListeners(ctx);

    const endpoints = await initApi(ctx);
    const {checkForUpdatesAndNotify} = await endpoints.readConfig().toPromise();

    initWebContentContextMenu();

    const uiContext = ctx.uiContext = {
        browserWindow: await initBrowserWindow(ctx, endpoints),
        tray: initTray(endpoints),
        appMenu: await initApplicationMenu(endpoints),
    };

    await endpoints.updateOverlayIcon({hasLoggedOut: false, unread: 0}).toPromise();

    if (checkForUpdatesAndNotify && ctx.runtimeEnvironment !== "e2e") {
        try {
            initAutoUpdate();
        } catch (e) {
            // TODO ignore "no internet connection" error only, and re-throw the other
            logger.error(e);
        }
    }

    app.on("second-instance", async () => {
        await endpoints.activateBrowserWindow().toPromise();
    });

    app.on("activate", async () => {
        // on macOS it's common to re-create a window in the app when the dock icon is clicked and there are no other windows open
        if (!uiContext.browserWindow || uiContext.browserWindow.isDestroyed()) {
            uiContext.browserWindow = await initBrowserWindow(ctx, endpoints);
        }
        await endpoints.activateBrowserWindow();
    });
});

app.on("web-contents-created", (() => {
    const srcWhitelist: string[] = Object
        .values(ACCOUNTS_CONFIG)
        .reduce((list: EntryUrlItem[], {entryUrl}) => list.concat(entryUrl), [])
        .filter((item) => !item.value.startsWith(ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX))
        .map(({value}) => value)
        .concat(
            Object
                .values(ctx.locations.webClients)
                .map((locationsMap) => Object.values(locationsMap))
                .reduce((list: typeof entryUrls, entryUrls) => list.concat(entryUrls), [])
                .map(({entryUrl}) => entryUrl),
        );

    return (webContentsCreatedEvent: Event, webContents: WebContents) => {
        webContents.on("will-attach-webview", (willAttachWebviewEvent, webPreferences, {src}) => {
            const allowedSrc = srcWhitelist.some((allowedPrefix) => src.startsWith(allowedPrefix));

            webPreferences.nodeIntegration = false;

            if (!allowedSrc) {
                willAttachWebviewEvent.preventDefault();
                logger.error(new Error(`Forbidden webview.src: "${allowedSrc}"`));
            }
        });
    };
})());
