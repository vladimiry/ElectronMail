import {app, BrowserWindow} from "electron";
import {equals} from "ramda";

import {activateBrowserWindow} from "./util";
import {BuildEnvironment} from "src/shared/model/common";
import {Context} from "./model";

export async function initBrowserWindow(ctx: Context): Promise<BrowserWindow> {
    const browserWindowConstructorOptions = {
        webPreferences: {
            nodeIntegration: (process.env.NODE_ENV as BuildEnvironment) === "development",
            webviewTag: true,
            webSecurity: true,
            // TODO explore "sandbox" mode
            // sandbox: true,
            disableBlinkFeatures: "Auxclick",
            preload: ctx.runtimeEnvironment === "e2e" ? ctx.locations.preload.browserWindowE2E : ctx.locations.preload.browserWindow,
        },
        icon: ctx.locations.icon,
        ...(await ctx.configStore.readExisting()).window.bounds,
        show: false,
    };
    const browserWindow = new BrowserWindow(browserWindowConstructorOptions);
    const appBeforeQuitEventHandler = () => forceClose = true;
    let forceClose = false;

    app.removeListener("before-quit", appBeforeQuitEventHandler);
    app.on("before-quit", appBeforeQuitEventHandler);

    browserWindow.on("ready-to-show", async () => {
        const settingsConfigured = await ctx.settingsStore.readable();
        const {startMinimized} = await ctx.configStore.readExisting();

        if (!settingsConfigured || !startMinimized) {
            activateBrowserWindow(ctx);
        }
    });
    browserWindow.on("closed", () => {
        browserWindow.destroy();
        forceClose = false;

        // On macOS it is common for applications and their menu bar to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== "darwin") {
            app.quit();
        }
    });
    browserWindow.on("close", async (event) => {
        const sender: BrowserWindow = (event as any).sender;

        if (forceClose) {
            return event.returnValue = true;
        }

        event.returnValue = false;
        event.preventDefault();

        if ((await ctx.configStore.readExisting()).closeToTray) {
            sender.hide();
        } else {
            forceClose = true;
            browserWindow.close();
        }

        return event.returnValue;
    });

    browserWindow.setMenu(null);
    browserWindow.loadURL(ctx.locations.browserWindowPage);

    // execute after handlers subscriptions
    await keepState(ctx, browserWindow);

    if ((process.env.NODE_ENV as BuildEnvironment) === "development") {
        browserWindow.webContents.openDevTools();
    }

    return browserWindow;
}

async function keepState(ctx: Context, browserWindow: Electron.BrowserWindow) {
    const debounce = 500;
    const {maximized, bounds} = (await ctx.configStore.readExisting()).window;
    let timeoutId: any;

    if (!("x" in bounds) || !("y" in bounds)) {
        browserWindow.center();
    }

    if (maximized) {
        browserWindow.maximize();
        browserWindow.hide();
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
