import {BrowserView, BrowserWindow, BrowserWindowConstructorOptions, app} from "electron";
import {Store} from "fs-json-store";
import {equals} from "ramda";

import {BuildEnvironment} from "src/shared/model/common";
import {Context} from "./model";
import {PRODUCT_NAME} from "src/shared/constants";

const browserWindowState: { forceClose: boolean } = {forceClose: false};
const appBeforeQuitEventArgs: ["before-quit", (event: Electron.Event) => void] = [
    "before-quit",
    () => browserWindowState.forceClose = true,
];
const commonWebPreferences: BrowserWindowConstructorOptions["webPreferences"] = {
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webviewTag: true,
    webSecurity: true,
    sandbox: true,
    disableBlinkFeatures: "Auxclick",
    // TODO disable "remote" module by disabling "enableRemoteModule" option
    //      currently these things depend on it:
    //      - "rolling-rate-limiter" module
    //      - "html-to-text" module
    //      - e2e tests preload script
    // enableRemoteModule: false,
};

export async function initBrowserWindow(ctx: Context): Promise<BrowserWindow> {
    const e2eRuntimeEnvironment = (
        ctx.runtimeEnvironment === "e2e"
        &&
        await new Store({file: ctx.locations.preload.browserWindowE2E, fs: ctx.storeFs}).readable()
    );
    const browserWindow = new BrowserWindow({
        webPreferences: {
            ...commonWebPreferences,
            preload: e2eRuntimeEnvironment
                ? ctx.locations.preload.browserWindowE2E
                : ctx.locations.preload.browserWindow,
        },
        title: PRODUCT_NAME,
        icon: ctx.locations.icon,
        ...(await ctx.configStore.readExisting()).window.bounds,
        show: false,
        autoHideMenuBar: true,
    });

    app.removeListener(...appBeforeQuitEventArgs);
    app.on(...appBeforeQuitEventArgs);

    browserWindow.on("ready-to-show", async () => {
        const settingsConfigured = await ctx.settingsStore.readable();
        const {startMinimized} = await ctx.configStore.readExisting();

        if (!settingsConfigured || !startMinimized) {
            await (await ctx.deferredEndpoints.promise).activateBrowserWindow().toPromise();
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

export function initFindInPageBrowserView(ctx: Context): BrowserView {
    if (!ctx.uiContext) {
        throw new Error(`UI Context has not been initialized`);
    }

    const browserView = new BrowserView({
        webPreferences: {
            ...commonWebPreferences,
            preload: ctx.locations.preload.searchInPageBrowserView,
        },
    });

    // WARN: "setBrowserView" needs to be called before "setBounds" call
    // otherwise BrowserView is invisible on macOS as "setBounds" call takes no effect
    ctx.uiContext.browserWindow.setBrowserView(browserView);

    browserView.setAutoResize({width: false, height: true});
    browserView.webContents.loadURL(ctx.locations.searchInPageBrowserViewPage);

    syncFindInPageBrowserViewSize(ctx, browserView);

    return browserView;
}

function syncFindInPageBrowserViewSize(ctx: Context, findInPageBrowserView?: BrowserView) {
    if (!ctx.uiContext) {
        return;
    }

    const browserView = findInPageBrowserView || ctx.uiContext.findInPageBrowserView;

    if (!browserView) {
        return;
    }

    const {browserWindow} = ctx.uiContext;
    const browserWindowBounds = browserWindow.getBounds();
    const alignCenter = browserWindowBounds.width < 600;
    const boundsSize = {
        width: alignCenter
            ? Math.trunc(browserWindowBounds.width * 0.9)
            : 400,
        height: 38,
    };
    const bounds = {
        x: alignCenter
            ? Math.trunc((browserWindowBounds.width - boundsSize.width) / 2)
            : browserWindowBounds.width - boundsSize.width - 25,
        y: 0,
        ...boundsSize,
    };

    browserView.setBounds(bounds);
}

export async function attachFullTextIndexWindow(ctx: Context): Promise<BrowserWindow> {
    if (!ctx.uiContext) {
        throw new Error(`UI Context has not been initialized`);
    }

    if (ctx.uiContext.fullTextSearchBrowserWindow) {
        throw new Error(`Full-text search process has already been spawned`);
    }

    // WARN: "fullTextSearchBrowserWindow" starts communicating with main process straight away on preload script loading
    // so main process api needs to be registered before "fullTextSearchBrowserWindow" creating
    await ctx.deferredEndpoints.promise;

    const browserWindow = new BrowserWindow({
        webPreferences: {
            ...commonWebPreferences,
            preload: ctx.locations.preload.fullTextSearchBrowserWindow,
        },
        show: false,
        autoHideMenuBar: true,
    });

    browserWindow.setMenu(null);
    browserWindow.loadURL("data:text/html,<html><body></body></html>");

    ctx.uiContext.fullTextSearchBrowserWindow = browserWindow;

    return browserWindow;
}

export async function detachFullTextIndexWindow(ctx: Context) {
    if (!ctx.uiContext || !ctx.uiContext.fullTextSearchBrowserWindow) {
        return;
    }

    // WARN: don't call "destroy" since app needs "window.onbeforeunload" to be triggered, see cleanup logic in preload script
    ctx.uiContext.fullTextSearchBrowserWindow.close();
    delete ctx.uiContext.fullTextSearchBrowserWindow;
}
