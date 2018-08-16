import {app} from "electron";
import {from} from "rxjs";

import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {loggedOutBundle, trayIconBundleFromPath, unreadNative} from "./icon-builder";

const config = {
    loggedOut: {scale: .25, color: "#F9C83E"},
    unread: {scale: .75, color: "#EE3F3B", textColor: "#FFFFFF"},
};

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "updateOverlayIcon">> {
    const defaultCanvas = await trayIconBundleFromPath(ctx.locations.trayIcon);
    const loggedOutCanvas = await loggedOutBundle(defaultCanvas, config.loggedOut);

    return {
        updateOverlayIcon: ({hasLoggedOut, unread}) => from((async () => {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            const tray = ctx.uiContext && ctx.uiContext.tray;

            if (!browserWindow || !tray) {
                return null;
            }

            const canvas = hasLoggedOut ? loggedOutCanvas : defaultCanvas;

            if (unread > 0) {
                const {icon, overlay} = await unreadNative(unread, ctx.locations.numbersFont, canvas, config.unread);
                browserWindow.setOverlayIcon(overlay, `Unread messages count: ${unread}`);
                tray.setImage(icon);
                app.setBadgeCount(unread);
            } else {
                browserWindow.setOverlayIcon(null as any, "");
                tray.setImage(canvas.native);
                app.setBadgeCount(0);
            }

            return null;
        })()),
    };
}
