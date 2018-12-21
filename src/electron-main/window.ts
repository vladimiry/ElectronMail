import {BrowserWindow, BrowserWindowConstructorOptions, app} from "electron";
import {Store} from "fs-json-store";
import {equals} from "ramda";

import {BuildEnvironment} from "src/shared/model/common";
import {Context} from "./model";
import {Endpoints} from "src/shared/api/main";

const developmentEnvironment = (process.env.NODE_ENV as BuildEnvironment) === "development";
const browserWindowState: { forceClose: boolean } = {forceClose: false};
const appBeforeQuitEventArgs: ["before-quit", (event: Electron.Event) => void] = [
    "before-quit",
    () => browserWindowState.forceClose = true,
];

export async function initBrowserWindow(ctx: Context, endpoints: Endpoints): Promise<BrowserWindow> {
    const e2eRuntimeEnvironment = ctx.runtimeEnvironment === "e2e"
        && await new Store({file: ctx.locations.preload.browserWindowE2E, fs: ctx.storeFs}).readable();
    const browserWindowConstructorOptions: BrowserWindowConstructorOptions = {
        webPreferences: {
            // enableRemoteModule: false, // TODO disable "remote" module on https://github.com/electron/electron/issues/15112 resolving
            nodeIntegration: developmentEnvironment,
            nodeIntegrationInWorker: false,
            webviewTag: true,
            webSecurity: true,
            // sandbox: true, // TODO explore "sandbox" mode
            disableBlinkFeatures: "Auxclick",
            preload: e2eRuntimeEnvironment
                ? ctx.locations.preload.browserWindowE2E
                : ctx.locations.preload.browserWindow,
        },
        icon: ctx.locations.icon,
        ...(await ctx.configStore.readExisting()).window.bounds,
        show: false,
        autoHideMenuBar: true,
    };
    const browserWindow = new BrowserWindow(browserWindowConstructorOptions);

    app.removeListener(...appBeforeQuitEventArgs);
    app.on(...appBeforeQuitEventArgs);

    browserWindow.on("ready-to-show", async () => {
        const settingsConfigured = await ctx.settingsStore.readable();
        const {startMinimized} = await ctx.configStore.readExisting();

        if (!settingsConfigured || !startMinimized) {
            await endpoints.activateBrowserWindow().toPromise();
        }
    });
    browserWindow.on("closed", () => {
        browserWindow.destroy();
        browserWindowState.forceClose = false;
        app.quit();
    });
    browserWindow.on("close", async (event) => {
        if (browserWindowState.forceClose) {
            return event.returnValue = true;
        }

        event.returnValue = false;
        event.preventDefault();

        if ((await ctx.configStore.readExisting()).closeToTray) {
            // TODO figure why "BrowserWindow.fromWebContents(event.sender).hide()" doesn't properly work (window gets closed)
            // BrowserWindow.fromWebContents(event.sender).hide();
            const sender: BrowserWindow = (event as any).sender;
            sender.hide();
        } else {
            browserWindowState.forceClose = true;
            browserWindow.close();
        }

        return event.returnValue;
    });

    browserWindow.setMenu(null);
    browserWindow.loadURL(ctx.locations.browserWindowPage);

    // execute after handlers subscriptions
    await keepState(ctx, browserWindow);

    if (developmentEnvironment) {
        browserWindow.webContents.openDevTools();
    }

    return browserWindow;
}

async function keepState(ctx: Context, browserWindow: Electron.BrowserWindow) {
    const {bounds} = (await ctx.configStore.readExisting()).window;
    const debounce = 500;
    let timeoutId: any;

    if (!("x" in bounds) || !("y" in bounds)) {
        browserWindow.center();
    }

    browserWindow.on("close", saveWindowStateHandler);
    browserWindow.on("resize", saveWindowStateHandlerDebounced);
    browserWindow.on("move", saveWindowStateHandlerDebounced);

    // debounce
    function saveWindowStateHandlerDebounced() {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(saveWindowStateHandler, debounce);
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
            // it might potentially be that "browserWindow" has already been destroyed on this stage
            return;
        }

        if (!equals(storedWindowConfig, newWindowConfig)) {
            await ctx.configStore.write({...config, window: newWindowConfig});
        }
    }
}
