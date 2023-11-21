import {app} from "electron";
import {first} from "rxjs/operators";
import {isDeepEqual} from "remeda";
import {lastValueFrom} from "rxjs";

import {BaseConfig} from "src/shared/model/options";
import {CircleConfig, ImageBundle} from "./model";
import {Context} from "src/electron-main/model";
import {DEFAULT_TRAY_ICON_COLOR, DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/const";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {loggedOutBundle, recolor, trayIconBundleFromPath, unreadNative} from "./lib";

const trayStyle: DeepReadonly<{loggedOut: CircleConfig; unread: CircleConfig & {textColor: string}}> = {
    loggedOut: {scale: .25, color: "#F9C83E"},
    unread: {scale: .75, color: DEFAULT_UNREAD_BADGE_BG_COLOR, textColor: DEFAULT_UNREAD_BADGE_BG_TEXT},
};

type resolveStateType = (
    ctx: DeepReadonly<Context>,
    sizeConfig: Pick<BaseConfig, "customTrayIconSize" | "customTrayIconSizeValue">,
) => Promise<
    {
        readonly fileIcon: ImageBundle;
        trayIconColor: string;
        customSizeConfig?: typeof sizeConfig;
        defaultIcon: ImageBundle;
        loggedOutIcon: ImageBundle;
    }
>;

const resolveState: resolveStateType = (() => {
    let state: Unpacked<ReturnType<resolveStateType>> | undefined;

    const resultFn: resolveStateType = async (ctx, sizeConfig) => {
        if (state) {
            return state;
        }

        const fileIcon = await trayIconBundleFromPath(ctx.locations.trayIcon, sizeConfig);
        const defaultIcon = fileIcon;
        const loggedOutIcon = await loggedOutBundle(defaultIcon, trayStyle.loggedOut, sizeConfig);

        state = {trayIconColor: DEFAULT_TRAY_ICON_COLOR, fileIcon, defaultIcon, loggedOutIcon};

        return state;
    };

    return resultFn;
})();

export async function buildEndpoints(ctx: DeepReadonly<Context>): Promise<Pick<IpcMainApiEndpoints, "updateOverlayIcon">> {
    return {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async updateOverlayIcon({hasLoggedOut, unread}) {
            const {browserWindow, tray} = (ctx.uiContext && await ctx.uiContext) ?? {};

            if (!browserWindow || !tray) {
                return;
            }

            const config = await lastValueFrom(ctx.config$.pipe(first()));
            const {
                customTrayIconColor,
                customTrayIconSize,
                customTrayIconSizeValue,
                customUnreadBgColor,
                customUnreadTextColor,
                disableNotLoggedInTrayIndication,
                doNotRenderNotificationBadgeValue,
            } = config;
            const customSizeConfig = {customTrayIconSize, customTrayIconSizeValue} as const;
            const state = await resolveState(ctx, customSizeConfig);

            if (
                (state.trayIconColor !== customTrayIconColor)
                || !isDeepEqual(state.customSizeConfig, customSizeConfig)
            ) {
                state.defaultIcon = await recolor({
                    source: state.fileIcon.bitmap,
                    fromColor: DEFAULT_TRAY_ICON_COLOR,
                    toColor: customTrayIconColor,
                }, customSizeConfig);
                state.loggedOutIcon = await loggedOutBundle(state.defaultIcon, trayStyle.loggedOut, customSizeConfig);
                state.trayIconColor = customTrayIconColor;
                state.customSizeConfig = customSizeConfig;
            }

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
                    customSizeConfig,
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
