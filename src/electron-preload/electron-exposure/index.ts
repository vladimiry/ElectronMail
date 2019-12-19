import {ElectronWindow} from "src/shared/model/electron";
import {IPC_MAIN_API} from "src/shared/api/main";
import {LOGGER} from "./logger";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/protonmail";
import {ROLLING_RATE_LIMITER} from "src/electron-preload/electron-exposure/rolling-rate-limiter";
import {registerDocumentClickEventListener} from "src/electron-preload/events-handling";

export const ELECTRON_WINDOW: Readonly<ElectronWindow> = Object.freeze({
    __ELECTRON_EXPOSURE__: Object.freeze({
        buildIpcMainClient: IPC_MAIN_API.client.bind(IPC_MAIN_API),
        buildIpcWebViewClient: Object.freeze({
            protonmail: PROTONMAIL_IPC_WEBVIEW_API.client,
        }),
        registerDocumentClickEventListener,
        rollingRateLimiter: ROLLING_RATE_LIMITER,
        Logger: LOGGER,
    }),
});

export function exposeElectronStuffToWindow(): ElectronWindow {
    const prop: keyof ElectronWindow = "__ELECTRON_EXPOSURE__";
    const {[prop]: value} = ELECTRON_WINDOW;

    Object.defineProperty(
        window,
        prop,
        {
            value,
            configurable: false,
            enumerable: false,
            writable: false,
        },
    );

    return ELECTRON_WINDOW;
}
