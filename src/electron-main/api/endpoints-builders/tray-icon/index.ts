import {app} from "electron";
import {first} from "rxjs/operators";
import {lastValueFrom} from "rxjs";

import {CircleConfig, ImageBundle} from "./model";
import {Context} from "src/electron-main/model";
import {DEFAULT_TRAY_ICON_COLOR, DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/constants";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/const";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {loggedOutBundle, recolor, trayIconBundleFromPath, unreadNative} from "./lib";

const trayStyle: DeepReadonly<{
    loggedOut: CircleConfig;
    unread: CircleConfig & { textColor: string };
}> = {
    loggedOut: {scale: .25, color: "#F9C83E"},
    unread: {scale: .75, color: DEFAULT_UNREAD_BADGE_BG_COLOR, textColor: DEFAULT_UNREAD_BADGE_BG_TEXT},
};

type resolveStateType = (ctx: DeepReadonly<Context>) => Promise<{
    readonly fileIcon: ImageBundle;
    trayIconColor: string;
    defaultIcon: ImageBundle;
    loggedOutIcon: ImageBundle;
}>;

const resolveState: resolveStateType = (() => {
    let state: Unpacked<ReturnType<resolveStateType>> | undefined;

    const resultFn: resolveStateType = async (ctx: DeepReadonly<Context>) => {
        if (state) {
            return state;
        }

        const fileIcon = await trayIconBundleFromPath(ctx.locations.trayIcon);
        const defaultIcon = fileIcon;
        const loggedOutIcon = await loggedOutBundle(defaultIcon, trayStyle.loggedOut);

        state = {
            trayIconColor: DEFAULT_TRAY_ICON_COLOR,
            fileIcon,
            defaultIcon,
            loggedOutIcon,
        };

        return state;
    };

    return resultFn;
})();

export async function buildEndpoints(
    ctx: DeepReadonly<Context>,
): Promise<Pick<IpcMainApiEndpoints, "updateOverlayIcon">> {
    return {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async updateOverlayIcon({hasLoggedOut, unread}) {
            const {browserWindow, tray} = (ctx.uiContext && await ctx.uiContext) ?? {};

            if (!browserWindow || !tray) {
                return;
            }

            const [
                state,
                {
                    customTrayIconColor,
                    customUnreadBgColor,
                    customUnreadTextColor,
                    disableNotLoggedInTrayIndication,
                    doNotRenderNotificationBadgeValue,
                },
            ] = await Promise.all([
                resolveState(ctx),
                lastValueFrom(ctx.config$.pipe(first())),
            ]);

            if (customTrayIconColor && state.trayIconColor !== customTrayIconColor) {
                state.defaultIcon = await recolor({
                    source: state.fileIcon.bitmap,
                    fromColor: DEFAULT_TRAY_ICON_COLOR,
                    toColor: customTrayIconColor,
                });
                state.loggedOutIcon = await loggedOutBundle(state.defaultIcon, trayStyle.loggedOut);
                state.trayIconColor = customTrayIconColor;
            }

            setImmediate(() => {
                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.TrayIconDataURL({value: state.defaultIcon.native.toDataURL()}),
                );
            });

            const canvas = !disableNotLoggedInTrayIndication && hasLoggedOut
                ? state.loggedOutIcon
                : state.defaultIcon;

            if (unread > 0) {
                const {icon, overlay} = await unreadNative(
                    doNotRenderNotificationBadgeValue
                        ? null
                        : unread,
                    ctx.locations.trayIconFont,
                    canvas,
                    {
                        ...trayStyle.unread,
                        ...(customUnreadBgColor && {color: customUnreadBgColor}),
                        ...(customUnreadTextColor && {textColor: customUnreadTextColor}),
                    },
                );

                tray.setImage(icon);
                browserWindow.setOverlayIcon(
                    overlay,
                    doNotRenderNotificationBadgeValue
                        ? "Unread messages present"
                        : `Unread messages count: ${unread}`,
                );
                app.badgeCount = doNotRenderNotificationBadgeValue
                    ? 0
                    : unread;
            } else {
                tray.setImage(canvas.native);
                browserWindow.setOverlayIcon(null, "");
                app.badgeCount = 0;
            }
        },
    };
}
