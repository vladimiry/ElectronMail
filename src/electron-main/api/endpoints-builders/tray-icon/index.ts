import {app} from "electron";

import {CircleConfig, ImageBundle} from "./model";
import {Context} from "src/electron-main/model";
import {DEFAULT_TRAY_ICON_COLOR, DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/constants";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {ReadonlyDeep} from "type-fest";
import {loggedOutBundle, recolor, trayIconBundleFromPath, unreadNative} from "./lib";

const config: ReadonlyDeep<{
    loggedOut: CircleConfig,
    unread: CircleConfig & { textColor: string },
}> = {
    loggedOut: {scale: .25, color: "#F9C83E"},
    unread: {scale: .75, color: DEFAULT_UNREAD_BADGE_BG_COLOR, textColor: DEFAULT_UNREAD_BADGE_BG_TEXT},
};

let state: {
    trayIconColor: string;
    readonly fileIcon: ImageBundle;
    defaultIcon: ImageBundle;
    loggedOutIcon: ImageBundle;
} | undefined;

export async function buildEndpoints(
    ctx: ReadonlyDeep<Context>,
): Promise<Pick<IpcMainApiEndpoints, "updateOverlayIcon">> {
    return {
        async updateOverlayIcon({hasLoggedOut, unread, unreadBgColor, unreadTextColor, trayIconColor}) {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            const tray = ctx.uiContext && ctx.uiContext.tray;

            if (!browserWindow || !tray) {
                return;
            }

            if (!state) {
                const fileIcon = await trayIconBundleFromPath(ctx.locations.trayIcon);
                const defaultIcon = fileIcon;
                const loggedOutIcon = await loggedOutBundle(defaultIcon, config.loggedOut);

                state = {
                    trayIconColor: DEFAULT_TRAY_ICON_COLOR,
                    fileIcon,
                    defaultIcon,
                    loggedOutIcon,
                };
            }

            if (trayIconColor && state.trayIconColor !== trayIconColor) {
                state.defaultIcon = await recolor({
                    source: state.fileIcon.bitmap,
                    fromColor: DEFAULT_TRAY_ICON_COLOR,
                    toColor: trayIconColor,
                });
                state.loggedOutIcon = await loggedOutBundle(state.defaultIcon, config.loggedOut);
                state.trayIconColor = trayIconColor;
            }

            const canvas = hasLoggedOut
                ? state.loggedOutIcon
                : state.defaultIcon;

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
