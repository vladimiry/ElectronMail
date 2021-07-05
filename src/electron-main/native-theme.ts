import {nativeTheme} from "electron";

import {Config} from "src/shared/model/options";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";

export const applyThemeSource = (themeSource: Config["themeSource"]): void => {
    nativeTheme.themeSource = themeSource;
};

export const initNativeThemeNotification = (themeSource: Config["themeSource"]): void => {
    nativeTheme.on("updated", () => {
        IPC_MAIN_API_NOTIFICATION$.next(
            IPC_MAIN_API_NOTIFICATION_ACTIONS.NativeTheme({shouldUseDarkColors: nativeTheme.shouldUseDarkColors}),
        );
    });

    applyThemeSource(themeSource);
};
