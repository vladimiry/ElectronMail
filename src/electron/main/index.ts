import * as electronUnhandled from "electron-unhandled";
import logger from "electron-log";
import {app} from "electron";

import {IpcMainActions} from "_shared/electron-actions";
import {Environment} from "_shared/model/electron";
import {isAllowedUrl} from "_shared/util";
import {initEndpoints} from "./ipc-main-api";
import {Context, UIContext} from "./model";
import {initContext} from "./util";
import {initBrowserWindow} from "./window";
import {initTray} from "./tray";
import {initAutoUpdate} from "./app-update";
import {initWebContentContextMenu} from "./web-content-context-menu";

electronUnhandled({logger: logger.error});

initContext().then(initApp);

let uiContext: UIContext;

export function initApp(ctx: Context) {
    if (app.makeSingleInstance(activateBrowserWindow)) {
        app.quit();
    }

    app.on("ready", async () => {
        const endpoints = initEndpoints(ctx);
        const readConfigApi = endpoints[IpcMainActions.ReadConfig.channel];

        await readConfigApi.process(undefined);

        initWebContentContextMenu(ctx);

        uiContext = ctx.uiContext = {
            browserWindow: await initBrowserWindow(ctx),
            tray: await initTray(ctx, endpoints),
        };

        ctx.on("toggleBrowserWindow", (forcedState?: boolean) => {
            const needsToBeVisible = typeof forcedState !== "undefined"
                ? forcedState
                : !uiContext.browserWindow.isVisible();

            if (needsToBeVisible) {
                activateBrowserWindow();
            } else {
                uiContext.browserWindow.hide();
            }
        });

        ((skipEnvs: Environment[]) => {
            if (skipEnvs.indexOf(ctx.env) === -1) {
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

export function activateBrowserWindow() {
    const browserWindow = uiContext && uiContext.browserWindow;

    if (browserWindow) {
        browserWindow.show();
        browserWindow.focus();
    }
}
