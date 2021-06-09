import {BrowserWindow} from "electron";

import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {resolveUiContextStrict} from "src/electron-main/util";

export async function attachFullTextIndexWindow(ctx: Context): Promise<BrowserWindow> {
    const uiContext = await resolveUiContextStrict(ctx);

    if (uiContext.fullTextSearchBrowserWindow) {
        throw new Error(`"${nameof.full(uiContext.fullTextSearchBrowserWindow)}" is already created`);
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
    await browserWindow.loadURL("data:text/html,<html><body></body></html>");

    uiContext.fullTextSearchBrowserWindow = browserWindow;

    return browserWindow;
}

export async function detachFullTextIndexWindow(ctx: Context): Promise<void> {
    const uiContext = ctx.uiContext && await ctx.uiContext;

    if (!uiContext?.fullTextSearchBrowserWindow) {
        return;
    }

    // WARN: don't call "destroy" since app needs "window.onbeforeunload" to be triggered, see cleanup logic in preload script
    uiContext.fullTextSearchBrowserWindow.close();
    delete uiContext.fullTextSearchBrowserWindow;
}
