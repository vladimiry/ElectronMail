import _logger from "electron-log";
import {BrowserView} from "electron";

import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/webpack-conts";
import {WEB_PROTOCOL_SCHEME} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";
import {injectVendorsAppCssIntoHtmlFile, resolveDefaultAppSession, resolveUiContextStrict} from "src/electron-main/util";

const logger = curryFunctionMembers(_logger, __filename);

const resolveContent = async (ctx: Context): Promise<Unpacked<ReturnType<typeof injectVendorsAppCssIntoHtmlFile>>> => {
    const injection = await injectVendorsAppCssIntoHtmlFile(ctx.locations.searchInPageBrowserViewPage, ctx.locations);
    logger.verbose(nameof(resolveContent), JSON.stringify(injection));
    return injection;
};

export async function syncFindInPageBrowserViewSize(ctx: Context, findInPageBrowserView?: BrowserView): Promise<void> {
    const uiContext = ctx.uiContext && await ctx.uiContext;

    if (!uiContext) {
        return;
    }

    const browserView = findInPageBrowserView ?? uiContext.findInPageBrowserView;

    if (!browserView) {
        return;
    }

    const {browserWindow} = uiContext;
    const browserWindowBounds = browserWindow.getBounds();
    const alignCenter = browserWindowBounds.width < 600;
    const boundsSize = {
        width: alignCenter
            ? Math.trunc(browserWindowBounds.width * 0.9)
            : 400,
        height: 30,
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

export const initFindInPageBrowserView: (ctx: Context) => Promise<BrowserView> = (
    (): typeof initFindInPageBrowserView => {
        const resultFn: typeof initFindInPageBrowserView = async (ctx): Promise<BrowserView> => {
            const browserView = new BrowserView({
                webPreferences: {
                    ...DEFAULT_WEB_PREFERENCES,
                    session: resolveDefaultAppSession(),
                    preload: ctx.locations.preload.searchInPageBrowserView,
                },
            });

            // WARN: "setBrowserView" needs to be called before "setBounds" call
            // otherwise BrowserView is invisible on macOS as "setBounds" call takes no effect
            (await resolveUiContextStrict(ctx)).browserWindow.setBrowserView(browserView);

            browserView.setAutoResize({width: false, height: false, horizontal: false, vertical: false});

            const {html} = await resolveContent(ctx);

            await browserView.webContents.loadURL(
                `data:text/html,${html}`,
                {baseURLForDataURL: `${WEB_PROTOCOL_SCHEME}:/${WEBPACK_WEB_CHUNK_NAMES["search-in-page-browser-view"]}/`},
            );

            await syncFindInPageBrowserViewSize(ctx, browserView);

            return browserView;
        };
        return resultFn;
    }
)();
