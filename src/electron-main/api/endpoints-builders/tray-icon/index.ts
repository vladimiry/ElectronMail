import {app} from "electron";
import {from} from "rxjs";

import {Context} from "src/electron-main/model";
import {DEFAULT_UNREAD_BADGE_BG_COLOR} from "src/shared/constants";
import {Endpoints} from "src/shared/api/main";
import {loggedOutBundle, trayIconBundleFromPath, unreadNative} from "./icon-builder";

const config = {
    loggedOut: {scale: .25, color: "#F9C83E"},
    unread: {scale: .75, color: DEFAULT_UNREAD_BADGE_BG_COLOR, textColor: "#FFFFFF"},
};

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "updateOverlayIcon">> {
    const defaultCanvas = await trayIconBundleFromPath(ctx.locations.trayIcon);
    const loggedOutCanvas = await loggedOutBundle(defaultCanvas, config.loggedOut);

    return {
        updateOverlayIcon: ({hasLoggedOut, unread, unreadBgColor}) => from((async () => {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            const tray = ctx.uiContext && ctx.uiContext.tray;

            if (!browserWindow || !tray) {
                return null;
            }

            const canvas = hasLoggedOut ? loggedOutCanvas : defaultCanvas;

            if (unread > 0) {
                const {
                    icon,
                    overlay,
                } = await unreadNative(
                    unread,
                    ctx.locations.numbersFont,
                    canvas,
                    {
                        ...config.unread,
                        ...(unreadBgColor && {color: unreadBgColor}),
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
