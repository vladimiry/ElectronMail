import {BrowserWindow} from "electron";

import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";

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
            ...DEFAULT_WEB_PREFERENCES,
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
