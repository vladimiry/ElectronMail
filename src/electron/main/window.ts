import * as deepEqual from "deep-equal";
import {app, BrowserWindow} from "electron";

import {Context} from "./model";

export async function initBrowserWindow(ctx: Context): Promise<BrowserWindow> {
    const preload = ctx.locations.preload.browser[ctx.env];
    const browserWindowConstructorOptions = {
        webPreferences: {
            nodeIntegration: ctx.env === "development",
            webviewTag: true,
            webSecurity: true,
            // sandbox: true,
            disableBlinkFeatures: "Auxclick",
            preload,
        },
        icon: ctx.locations.icon,
        ...(await ctx.configStore.readExisting()).window.bounds,
        show: false,
    };
    const browserWindow = new BrowserWindow(browserWindowConstructorOptions);
    const appBeforeQuitEventHandler = () => forceClose = true;
    let forceClose = false;

    app.on("before-quit", appBeforeQuitEventHandler);

    keepState(ctx, browserWindow);

    browserWindow.on("ready-to-show", async () => {
        const settingsNotConfigured = !(await ctx.settingsStore.readable());
        const startMinimized = (await ctx.configStore.readExisting()).startMinimized;

        if (settingsNotConfigured || !startMinimized) {
            ctx.emit("toggleBrowserWindow", true);
        }
    });
    browserWindow.on("closed", () => {
        browserWindow.destroy();

        app.removeListener("before-quit", appBeforeQuitEventHandler);

        // On macOS it is common for applications and their menu bar to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== "darwin") {
            app.quit();
        }
    });
    browserWindow.on("close", (event) => {
        if (!ctx.configInstance().closeToTray || forceClose) {
            // allow window closing
            return true;
        }

        const sender: BrowserWindow = (event as any).sender;

        event.preventDefault();
        sender.hide();

        return false;
    });

    if (ctx.env === "development") {
        // await require("devtron").install();
        browserWindow.webContents.openDevTools();
    }

    browserWindow.setMenu(null);
    browserWindow.loadURL(ctx.locations.page);

    return browserWindow;
}

async function keepState(ctx: Context, browserWindow: Electron.BrowserWindow) {
    const debounce = 500;
    let timeoutId: any;
    // TODO make sure config has already been created on this stage
    const {maximized, bounds} = (await ctx.configStore.readExisting()).window;

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

        if (!deepEqual(storedWindowConfig, newWindowConfig)) {
            ctx.configStore.write({...config, window: newWindowConfig});
        }
    }
}
