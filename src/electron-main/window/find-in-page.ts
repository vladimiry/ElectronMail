import _logger from "electron-log";
import {WebContentsView} from "electron";

import {Context} from "src/electron-main/model";
import {curryFunctionMembers} from "src/shared/util";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {injectVendorsAppCssIntoHtmlFile, resolveDefaultAppSession, resolveUiContextStrict} from "src/electron-main/util";
import {WEB_DATAURL_PROTOCOL_SCHEME} from "src/shared/const";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/const/webpack";

const logger = curryFunctionMembers(_logger, __filename);

const resolveContent = async (ctx: Context): Promise<Unpacked<ReturnType<typeof injectVendorsAppCssIntoHtmlFile>>> => {
    const injection = await injectVendorsAppCssIntoHtmlFile(ctx.locations.searchInPageWebContentsViewPage, ctx.locations);
    logger.verbose(nameof(resolveContent), JSON.stringify(injection));
    return injection;
};

export async function syncFindInPageViewSize(ctx: Context, findInPageView?: WebContentsView): Promise<void> {
    const uiContext = ctx.uiContext && await ctx.uiContext;
    if (!uiContext) {
        return;
    }
    const view = findInPageView ?? uiContext.findInPageView;
    if (!view) {
        return;
    }
    const {browserWindow} = uiContext;
    const browserWindowBounds = browserWindow.getBounds();
    const alignCenter = browserWindowBounds.width < 600;
    const boundsSize = {
        width: alignCenter ? Math.trunc(browserWindowBounds.width * 0.9) : BUILD_ENVIRONMENT === "development" ? 1400 : 400,
        height: BUILD_ENVIRONMENT === "development" ? 900 : 32,
    };
    const bounds = {
        x: alignCenter ? Math.trunc((browserWindowBounds.width - boundsSize.width) / 2) : browserWindowBounds.width - boundsSize.width - 25,
        y: 0,
        ...boundsSize,
    };
    view.setBounds(bounds);
}

export const initFindInPageView: (ctx: Context) => Promise<WebContentsView> = (
    (): typeof initFindInPageView => {
        return async (ctx) => {
            const view = new WebContentsView({
                webPreferences: {
                    ...DEFAULT_WEB_PREFERENCES,
                    session: resolveDefaultAppSession(),
                    preload: ctx.locations.preload.searchInPageWebContentsView,
                },
            });

            // WARN: "addChildView" needs to be called before "setBounds" call
            // otherwise BrowserView is invisible on macOS as "setBounds" call takes no effect
            (await resolveUiContextStrict(ctx)).browserWindow.contentView.addChildView(view);

            const {html} = await resolveContent(ctx);
            await view.webContents.loadURL(`data:text/html,${encodeURIComponent(html)}`, {
                baseURLForDataURL: `${WEB_DATAURL_PROTOCOL_SCHEME}://${WEBPACK_WEB_CHUNK_NAMES["search-in-page-browser-view"]}/`,
            });

            await syncFindInPageViewSize(ctx, view);

            if (BUILD_ENVIRONMENT === "development") {
                view.webContents.openDevTools(/* {mode: "detach"} */);
            }

            return view;
        };
    }
)();
