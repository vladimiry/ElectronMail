import * as electronUnhandled from "electron-unhandled";
import logger from "electron-log";
import {app} from "electron";

import {IpcMainActions} from "_shared/electron-actions";
import {Environment} from "_shared/model/electron";
import {isAllowedUrl} from "_shared/util";
import {initEndpoints} from "./ipc-main-api";
import {Context} from "./model";
import {activateBrowserWindow, initContext} from "./util";
import {initBrowserWindow} from "./window";
import {initTray} from "./tray";
import {initAutoUpdate} from "./app-update";
import {initWebContentContextMenu} from "./web-content-context-menu";

electronUnhandled({logger: logger.error});

// tslint:disable-next-line:no-floating-promises
initContext().then(initApp);

export function initApp(ctx: Context) {
    if (app.makeSingleInstance(() => activateBrowserWindow(ctx.uiContext))) {
        // calling app.exit() instead of app.quit() in order to prevent "Error: Cannot find module ..." error happening
        // https://github.com/electron/electron/issues/8862
        app.exit();
    }

    app.on("ready", async () => {
        const endpoints = initEndpoints(ctx);
        const {checkForUpdatesAndNotify} = await endpoints[IpcMainActions.ReadConfig.channel].process(undefined);

        // should be called before "browserWindow" creating (listens for "browser-window-created" event)
        initWebContentContextMenu(ctx);

        const uiContext = ctx.uiContext = {
            browserWindow: await initBrowserWindow(ctx),
            tray: await initTray(ctx, endpoints),
        };

        ((skipEnvs: Environment[]) => {
            if (checkForUpdatesAndNotify && skipEnvs.indexOf(ctx.env) === -1) {
                initAutoUpdate();
            }
        })(["development", "e2e"]);

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
