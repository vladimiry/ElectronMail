import {contextBridge} from "electron"; // tslint:disable-line:no-import-zones

import {ElectronWindow} from "src/shared/model/electron";
import {IPC_MAIN_API} from "src/shared/api/main";
import {LOGGER} from "src/electron-preload/lib/electron-exposure/logger";
import {ROLLING_RATE_LIMITER} from "src/electron-preload/lib/electron-exposure/rolling-rate-limiter";

export const ELECTRON_WINDOW: Readonly<ElectronWindow> = Object.freeze({
    __ELECTRON_EXPOSURE__: Object.freeze({
        buildIpcMainClient: IPC_MAIN_API.client.bind(IPC_MAIN_API),
        // buildIpcWebViewClient: PROTONMAIL_IPC_WEBVIEW_API.client.bind(PROTONMAIL_IPC_WEBVIEW_API),
        rollingRateLimiter: ROLLING_RATE_LIMITER,
        Logger: LOGGER,
    }),
});

export function exposeElectronStuffToWindow(): void {
    const prop: keyof ElectronWindow = "__ELECTRON_EXPOSURE__";

    contextBridge.exposeInMainWorld(
        prop,
        ELECTRON_WINDOW.__ELECTRON_EXPOSURE__,
    );
}
