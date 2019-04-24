import {app} from "electron";
import {from} from "rxjs";
import {platform} from "os";

import {Context} from "src/electron-main/model";
import {DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/constants";
import {Endpoints} from "src/shared/api/main";
import {loggedOutBundle, trayIconBundleFromPath, unreadNative} from "./icon-builder";

// TODO use "deep freezing" util
const config = Object.freeze({
    loggedOut: Object.freeze({scale: .25, color: "#F9C83E"}),
    unread: Object.freeze({scale: .75, color: DEFAULT_UNREAD_BADGE_BG_COLOR, textColor: DEFAULT_UNREAD_BADGE_BG_TEXT}),
});

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "updateOverlayIcon">> {
    const trayIconFileProp = platform() === "darwin"
        ? "trayIconDarwin" // macOS uses 16x16 tray icon
        : "trayIcon";
    const defaultCanvas = await trayIconBundleFromPath(ctx.locations[trayIconFileProp]);
    const loggedOutCanvas = await loggedOutBundle(defaultCanvas, config.loggedOut);

    return {
        updateOverlayIcon: ({hasLoggedOut, unread, unreadBgColor, unreadTextColor}) => from((async () => {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            const tray = ctx.uiContext && ctx.uiContext.tray;

            if (!browserWindow || !tray) {
                return null;
            }

            const canvas = hasLoggedOut
                ? loggedOutCanvas
                : defaultCanvas;

            if (unread > 0) {
                const {icon, overlay} = await unreadNative(
                    unread,
                    ctx.locations.numbersFont,
                    canvas,
                    {
                        ...config.unread,
                        ...(unreadBgColor && {color: unreadBgColor}),
                        ...(unreadTextColor && {textColor: unreadTextColor}),
                    },
                );

                browserWindow.setOverlayIcon(overlay, `Unread messages count: ${unread}`);
                tray.setImage(icon);
                app.setBadgeCount(unread);
            } else {
                browserWindow.setOverlayIcon(null, "");
                tray.setImage(canvas.native);
                app.setBadgeCount(0);
            }

            return null;
        })()),
    };
}
