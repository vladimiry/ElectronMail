import electronUnhandled from "electron-unhandled";
import logger from "electron-log";
import {app} from "electron";

import {APP_NAME} from "src/shared/constants";
import {Context} from "./model";
import {initApi} from "./api";
import {initAutoUpdate} from "./app-update";
import {initBrowserWindow} from "./window";
import {initContext} from "./util";
import {initTray} from "./tray";
import {initWebContentContextMenu} from "./web-content-context-menu";
import {isWebViewSrcWhitelisted} from "src/shared/util";

electronUnhandled({logger: logger.error});

// needed for desktop notifications properly working on Win 10, details https://www.electron.build/configuration/nsis
app.setAppUserModelId(`com.github.vladimiry.${APP_NAME}`);

// possible rejection will be caught and logged by above initialized "electron-unhandled"
// tslint:disable-next-line:no-floating-promises
initContext().then(initApp);

export function initApp(ctx: Context) {
    app.on("ready", async () => {
        if (app.makeSingleInstance(async () => endpoints.activateBrowserWindow().toPromise())) {
            // calling app.exit() instead of app.quit() in order to prevent "Error: Cannot find module ..." error happening
            // https://github.com/electron/electron/issues/8862
            app.exit();
        }

        const endpoints = await initApi(ctx);
        const {checkForUpdatesAndNotify} = await endpoints.readConfig().toPromise();

        initWebContentContextMenu(ctx);

        const uiContext = ctx.uiContext = {
            browserWindow: await initBrowserWindow(ctx, endpoints),
            tray: initTray(endpoints),
        };

        await endpoints.updateOverlayIcon({hasLoggedOut: false, unread: 0}).toPromise();

        if (checkForUpdatesAndNotify && ctx.runtimeEnvironment !== "e2e") {
            initAutoUpdate();
        }

        app.on("activate", async () => {
            // on macOS it's common to re-create a window in the app when the dock icon is clicked and there are no other windows open
            if (!uiContext.browserWindow || uiContext.browserWindow.isDestroyed()) {
                uiContext.browserWindow = await initBrowserWindow(ctx, endpoints);
            }
        });

        app.on("web-contents-created", (webContentsCreatedEvent, contents) => {
            contents.on("will-attach-webview", (willAttachWebviewEvent, webPreferences, params) => {
                webPreferences.nodeIntegration = false;

                if (!isWebViewSrcWhitelisted(params.src)) {
                    willAttachWebviewEvent.preventDefault();
                }
            });
        });
    });
}
