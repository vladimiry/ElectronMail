import {app} from "electron";

import {CircleConfig} from "./model";
import {Context} from "src/electron-main/model";
import {DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/constants";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {loggedOutBundle, trayIconBundleFromPath, unreadNative} from "./icon-builder";

// TODO use "deep freezing" util
const config: {
    loggedOut: CircleConfig,
    unread: CircleConfig & { textColor: string },
} = {
    loggedOut: {scale: .25, color: "#F9C83E"},
    unread: {scale: .75, color: DEFAULT_UNREAD_BADGE_BG_COLOR, textColor: DEFAULT_UNREAD_BADGE_BG_TEXT},
};

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, "updateOverlayIcon">> {
    const defaultCanvas = await trayIconBundleFromPath(ctx.locations.trayIcon);
    const loggedOutCanvas = await loggedOutBundle(defaultCanvas, config.loggedOut);

    return {
        async updateOverlayIcon({hasLoggedOut, unread, unreadBgColor, unreadTextColor}) {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            const tray = ctx.uiContext && ctx.uiContext.tray;

            if (!browserWindow || !tray) {
                return;
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
        },
    };
}
