import logger from "electron-log";
import {BrowserWindow, app} from "electron";
import {equals} from "ramda";

import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {PRODUCT_NAME} from "src/shared/constants";
import {syncFindInPageBrowserViewSize} from "src/electron-main/window/find-in-page";

export async function initMainBrowserWindow(ctx: Context): Promise<BrowserWindow> {
    const state: { forceClose: boolean } = {forceClose: false};
    const appBeforeQuitEventArgs: ["before-quit", (event: Electron.Event) => void] = [
        "before-quit",
        () => state.forceClose = true,
    ];
    const browserWindow = new BrowserWindow({
        webPreferences: {
            ...DEFAULT_WEB_PREFERENCES,
            preload: ctx.runtimeEnvironment === "e2e"
                ? ctx.locations.preload.browserWindowE2E
                : ctx.locations.preload.browserWindow,
        },
        title: PRODUCT_NAME,
        icon: ctx.locations.icon,
        show: false,
        autoHideMenuBar: true,
    });

    app.removeListener(...appBeforeQuitEventArgs);
    app.on(...appBeforeQuitEventArgs);

    browserWindow
        .on("ready-to-show", async () => {
            const settingsConfigured = await ctx.settingsStore.readable();
            const {startMinimized, window: {bounds: savedBounds}} = await ctx.configStore.readExisting();
            const {x, y} = browserWindow.getBounds();

            // simply call as "setBounds(savedBounds)" after https://github.com/electron/electron/issues/16264 resolving
            browserWindow.setBounds({
                ...savedBounds,
                x: savedBounds.x || x,
                y: savedBounds.y || y,
            });

            if (!settingsConfigured || !startMinimized) {
                await (await ctx.deferredEndpoints.promise).activateBrowserWindow(browserWindow);
            }
        })
        .on("closed", () => {
            browserWindow.destroy();
            state.forceClose = false;
            app.quit();
        })
        .on("close", async (event) => {
            if (state.forceClose) {
                return event.returnValue = true;
            }

            event.returnValue = false;
            event.preventDefault();

            if ((await ctx.configStore.readExisting()).closeToTray) {
                browserWindow.hide();
            } else {
                state.forceClose = true;
                browserWindow.close(); // re-triggering the same "close" event
            }

            return event.returnValue;
        });

    browserWindow.setMenu(null);

    await browserWindow.loadURL(ctx.locations.browserWindowPage);

    // execute after event handlers got subscribed
    await keepBrowserWindowState(ctx, browserWindow);

    if (BUILD_ENVIRONMENT === "development") {
        browserWindow.webContents.openDevTools();
    }

    return browserWindow;
}

async function keepBrowserWindowState(ctx: Context, browserWindow: Electron.BrowserWindow) {
    await (async () => {
        const {window: {bounds}} = await ctx.configStore.readExisting();
        const hasSavedPosition = "x" in bounds && "y" in bounds;

        if (!hasSavedPosition) {
            browserWindow.center();
        }
    })();

    const saveWindowStateHandler = async () => {
        const config = await ctx.configStore.readExisting();
        const storedWindowConfig = Object.freeze(config.window);
        const newWindowConfig = {...config.window};

        try {
            newWindowConfig.maximized = browserWindow.isMaximized();

            if (!newWindowConfig.maximized) {
                newWindowConfig.bounds = browserWindow.getBounds();
            }
        } catch (error) {
            // "browserWindow" might be destroyed at this point
            console.log(error); // tslint:disable-line:no-console
            logger.warn("failed to resolve window bounds", error);
            return;
        }

        if (equals(storedWindowConfig, newWindowConfig)) {
            return;
        }

        await ctx.configStore.write({
            ...config,
            window: newWindowConfig,
        });
    };
    const saveWindowStateHandlerDebounced = (() => {
        let timeoutId: any;
        return () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(saveWindowStateHandler, 500);
            syncFindInPageBrowserViewSize(ctx);
        };
    })();

    browserWindow.on("close", saveWindowStateHandler);
    browserWindow.on("resize", saveWindowStateHandlerDebounced);
    browserWindow.on("move", saveWindowStateHandlerDebounced);
}
