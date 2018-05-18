import * as deepEqual from "deep-equal";
import {app, BrowserWindow} from "electron";

import {Context} from "./model";
import {activateBrowserWindow} from "./util";

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
    const appBeforeQuitEventHandler = () => ctx.forceClose = true;

    app.on("before-quit", appBeforeQuitEventHandler);

    browserWindow.on("ready-to-show", async () => {
        const settingsNotConfigured = !(await ctx.settingsStore.readable());
        const {startMinimized} = await ctx.configStore.readExisting();

        if (settingsNotConfigured || !startMinimized) {
            activateBrowserWindow(ctx.uiContext);
        }
    });
    browserWindow.on("closed", () => {
        browserWindow.destroy();
        delete ctx.forceClose;
        app.removeListener("before-quit", appBeforeQuitEventHandler);

        // On macOS it is common for applications and their menu bar to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== "darwin") {
            app.quit();
        }
    });
    browserWindow.on("close", (event) => {
        const sender: BrowserWindow = (event as any).sender;

        if (ctx.forceClose) {
            return event.returnValue = true;
        }

        event.returnValue = false;
        event.preventDefault();

        (async () => {
            if ((await ctx.configStore.readExisting()).closeToTray) {
                sender.hide();
            } else {
                ctx.forceClose = true;
                browserWindow.close();
            }
        })();

        return event.returnValue;
    });

    if (ctx.env === "development") {
        // await require("devtron").install();
        browserWindow.webContents.openDevTools();
    }

    browserWindow.setMenu(null);
    browserWindow.loadURL(ctx.locations.page);

    // execute after handlers subscriptions
    await keepState(ctx, browserWindow);

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

        if (!deepEqual(storedWindowConfig, newWindowConfig)) {
            ctx.configStore.write({...config, window: newWindowConfig});
        }
    }
}
