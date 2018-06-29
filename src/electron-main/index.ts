import electronUnhandled from "electron-unhandled";
import logger from "electron-log";
import {app} from "electron";

import {activateBrowserWindow, initContext} from "./util";
import {BuildEnvironment} from "_@shared/model/common";
import {Context} from "./model";
import {initAutoUpdate} from "./app-update";
import {initBrowserWindow} from "./window";
import {initEndpoints} from "./ipc-main-api";
import {initTray} from "./tray";
import {initWebContentContextMenu} from "./web-content-context-menu";
import {isAllowedUrl} from "_@shared/util";

electronUnhandled({logger: logger.error});

// needs for desktop notifications properly working on Win 10, details https://www.electron.build/configuration/nsis
app.setAppUserModelId("com.github.vladimiry.protonmail-desktop-app");

// tslint:disable-next-line:no-floating-promises
initContext().then(initApp);

export async function initApp(ctx: Context) {
    if (app.makeSingleInstance(() => activateBrowserWindow(ctx))) {
        // calling app.exit() instead of app.quit() in order to prevent "Error: Cannot find module ..." error happening
        // https://github.com/electron/electron/issues/8862
        app.exit();
    }

    if ((process.env.NODE_ENV as BuildEnvironment) === "development") {
        app.on("web-contents-created", (webContentsCreatedEvent, contents) => {
            contents.openDevTools();
        });
    }

    app.on("ready", async () => {
        const endpoints = await initEndpoints(ctx);
        const {checkForUpdatesAndNotify} = await endpoints.readConfig().toPromise();

        // should be called before "browserWindow" creating (listens for "browser-window-created" event)
        initWebContentContextMenu(ctx);

        const uiContext = ctx.uiContext = {
            browserWindow: await initBrowserWindow(ctx),
            tray: await initTray(ctx, endpoints),
        };

        if (checkForUpdatesAndNotify && ctx.runtimeEnvironment !== "e2e") {
            initAutoUpdate();
        }

        app.on("activate", async () => {
            // on macOS it's common to re-create a window in the app when the dock icon is clicked and there are no other windows open
            if (!uiContext.browserWindow || uiContext.browserWindow.isDestroyed()) {
                uiContext.browserWindow = await initBrowserWindow(ctx);
            }
        });
        app.on("web-contents-created", (webContentsCreatedEvent, contents) => {
            contents.on("will-attach-webview", (willAttachWebviewEvent, webPreferences, params) => {
                webPreferences.nodeIntegration = false;

                if (!isAllowedUrl(params.src)) {
                    willAttachWebviewEvent.preventDefault();
                }
            });
        });
    });
}
