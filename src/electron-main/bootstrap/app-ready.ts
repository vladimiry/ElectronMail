import electronLog from "electron-log";
import {Deferred} from "ts-deferred";
import {app} from "electron";

import {Context, UIContext} from "src/electron-main/model";
import {initApiEndpoints} from "src/electron-main/api";
import {initApplicationMenu} from "src/electron-main/menu";
import {initMainBrowserWindow} from "src/electron-main/window/main";
import {initNativeThemeNotification} from "src/electron-main/native-theme";
import {initSpellCheckController} from "src/electron-main/spell-check/controller";
import {initTray} from "src/electron-main/tray";
import {initWebContentsCreatingHandlers} from "src/electron-main/web-contents";
import {registerWebFolderFileProtocol} from "src/electron-main/protocol";
import {resolveDefaultAppSession} from "src/electron-main/util";
import {setUpPowerMonitorNotification} from "src/electron-main/power-monitor";

export async function appReadyHandler(ctx: Context): Promise<void> {
    const uiContextDeferred: Deferred<UIContext> = new Deferred();
    const uiContextDependentEndpoints = (async () => {
        const [endpoints] = await Promise.all([
            ctx.deferredEndpoints.promise,
            uiContextDeferred.promise,
        ]);
        return endpoints;
    })();

    registerWebFolderFileProtocol(ctx, resolveDefaultAppSession());

    await initApiEndpoints(ctx);

    // so consequent "ctx.configStore.readExisting()" calls don't fail since "endpoints.readConfig()" call initializes the config
    const {spellCheckLocale, logLevel, themeSource} = await (await ctx.deferredEndpoints.promise).readConfig();

    // TODO test "logger.transports.file.level" update
    electronLog.transports.file.level = logLevel;

    initNativeThemeNotification(themeSource);

    await (async (): Promise<void> => {
        const spellCheckController = await initSpellCheckController(spellCheckLocale);
        ctx.getSpellCheckController = (): typeof spellCheckController => spellCheckController;
    })();

    // TODO test "initWebContentsCreatingHandlers" called after "ctx.getSpellCheckController" got initialized
    await initWebContentsCreatingHandlers(ctx);

    {
        ctx.uiContext = uiContextDeferred.promise;
        uiContextDeferred.resolve(
            (async () => {
                const [browserWindow, appMenu, tray] = await Promise.all([
                    initMainBrowserWindow(ctx),
                    initApplicationMenu(uiContextDependentEndpoints),
                    initTray(uiContextDependentEndpoints),
                ]);
                return {browserWindow, appMenu, tray};
            })(),
        );
    }

    setUpPowerMonitorNotification();

    app.on("second-instance", async () => (await uiContextDependentEndpoints).activateBrowserWindow());
    app.on("activate", async () => (await uiContextDependentEndpoints).activateBrowserWindow());

    await (await uiContextDependentEndpoints).updateOverlayIcon({hasLoggedOut: false, unread: 0});
}
