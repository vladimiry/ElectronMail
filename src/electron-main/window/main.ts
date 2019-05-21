import {BrowserWindow, app} from "electron";
import {Store} from "fs-json-store";
import {equals} from "ramda";

import {BuildEnvironment} from "src/shared/model/common";
import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {PRODUCT_NAME} from "src/shared/constants";
import {syncFindInPageBrowserViewSize} from "src/electron-main/window/find-in-page";

const state: { forceClose: boolean } = {forceClose: false};

const appBeforeQuitEventArgs: ["before-quit", (event: Electron.Event) => void] = [
    "before-quit",
    () => state.forceClose = true,
];

export async function initMainBrowserWindow(ctx: Context): Promise<BrowserWindow> {
    const e2eRuntimeEnvironment = (
        ctx.runtimeEnvironment === "e2e"
        &&
        await new Store({file: ctx.locations.preload.browserWindowE2E, fs: ctx.storeFs}).readable()
    );
    app.removeListener(...appBeforeQuitEventArgs);

    const browserWindow = new BrowserWindow({
        webPreferences: {
            ...DEFAULT_WEB_PREFERENCES,
            preload: e2eRuntimeEnvironment
                ? ctx.locations.preload.browserWindowE2E
                : ctx.locations.preload.browserWindow,
        },
        title: PRODUCT_NAME,
        icon: ctx.locations.icon,
        show: false,
        autoHideMenuBar: true,
        ...(await ctx.configStore.readExisting()).window.bounds,
    });
    app.on(...appBeforeQuitEventArgs);

    browserWindow.on("ready-to-show", async () => {
        const settingsConfigured = await ctx.settingsStore.readable();
        const {startMinimized} = await ctx.configStore.readExisting();

        if (!settingsConfigured || !startMinimized) {
            await (await ctx.deferredEndpoints.promise).activateBrowserWindow(browserWindow);
        }
    });
    browserWindow.on("closed", () => {
        browserWindow.destroy();
        state.forceClose = false;
        app.quit();
    });
    browserWindow.on("close", async (event) => {
        if (state.forceClose) {
            return event.returnValue = true;
        }

        event.returnValue = false;
        event.preventDefault();

        if ((await ctx.configStore.readExisting()).closeToTray) {
            // TODO figure why "BrowserWindow.fromWebContents(event.sender).hide()" doesn't properly work (window gets closed)
            const sender: BrowserWindow = (event as any).sender;
            sender.hide();
        } else {
            state.forceClose = true;
            browserWindow.close();
        }

        return event.returnValue;
    });

    browserWindow.setMenu(null);
    await browserWindow.loadURL(ctx.locations.browserWindowPage);

    // execute after handlers subscriptions
    await keepBrowserWindowState(ctx, browserWindow);

    if ((process.env.NODE_ENV as BuildEnvironment) === "development") {
        browserWindow.webContents.openDevTools();
    }

    return browserWindow;
}

async function keepBrowserWindowState(ctx: Context, browserWindow: Electron.BrowserWindow) {
    const {bounds} = (await ctx.configStore.readExisting()).window;
    const debounce = 500;
    let timeoutId: any;

    if (!("x" in bounds && "y" in bounds)) {
        browserWindow.center();
    }

    browserWindow.on("close", saveWindowStateHandler);
    browserWindow.on("resize", saveWindowStateHandlerDebounced);
    browserWindow.on("move", saveWindowStateHandlerDebounced);

    // debounce
    function saveWindowStateHandlerDebounced() {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(saveWindowStateHandler, debounce);
        syncFindInPageBrowserViewSize(ctx);
    }

    async function saveWindowStateHandler() {
        const config = Object.freeze(await ctx.configStore.readExisting());
        const storedWindowConfig = Object.freeze(config.window);
        const newWindowConfig = {...config.window};

        try {
            newWindowConfig.maximized = browserWindow.isMaximized();

            if (!newWindowConfig.maximized) {
                newWindowConfig.bounds = browserWindow.getBounds();
            }
        } catch {
            // "browserWindow" might be destroyed at this point
            return;
        }

        if (!equals(storedWindowConfig, newWindowConfig)) {
            await ctx.configStore.write({...config, window: newWindowConfig});
        }
    }
}
