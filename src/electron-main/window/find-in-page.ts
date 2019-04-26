import _logger from "electron-log";
import {BrowserView} from "electron";

import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {Unpacked} from "src/shared/types";
import {curryFunctionMembers} from "src/shared/util";
import {injectVendorsAppCssIntoHtmlFile} from "src/electron-main/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/window/find-in-page]");

export const initFindInPageBrowserView: (ctx: Context) => Promise<BrowserView> = (() => {
    let cache:
        | Unpacked<ReturnType<typeof injectVendorsAppCssIntoHtmlFile>>
        | undefined;
    const resultFn: typeof initFindInPageBrowserView = async (ctx) => {
        if (!ctx.uiContext) {
            throw new Error(`UI Context has not been initialized`);
        }

        const browserView = new BrowserView({
            webPreferences: {
                ...DEFAULT_WEB_PREFERENCES,
                preload: ctx.locations.preload.searchInPageBrowserView,
            },
        });

        // WARN: "setBrowserView" needs to be called before "setBounds" call
        // otherwise BrowserView is invisible on macOS as "setBounds" call takes no effect
        ctx.uiContext.browserWindow.setBrowserView(browserView);

        if (!cache) {
            cache = await injectVendorsAppCssIntoHtmlFile(ctx.locations.searchInPageBrowserViewPage, ctx.locations);
            logger.verbose(JSON.stringify(cache));
        }

        browserView.setAutoResize({width: false, height: true});
        await browserView.webContents.loadURL(`data:text/html,${cache.html}`, {baseURLForDataURL: cache.baseURLForDataURL});

        syncFindInPageBrowserViewSize(ctx, browserView);

        return browserView;
    };
    return resultFn;
})();

export function syncFindInPageBrowserViewSize(ctx: Context, findInPageBrowserView?: BrowserView): void {
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
