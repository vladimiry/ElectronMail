import {ElectronWindow} from "src/shared/model/electron";
import {IPC_MAIN_API} from "src/shared/api/main-process";
import {LOGGER} from "src/electron-preload/lib/electron-exposure/logger";
import {PROTON_CALENDAR_IPC_WEBVIEW_API} from "src/shared/api/webview/calendar";
import {PROTON_PRIMARY_IPC_WEBVIEW_API} from "src/shared/api/webview/primary";
import {registerDocumentClickEventListener} from "src/electron-preload/lib/events-handling";

export const ELECTRON_WINDOW: Readonly<ElectronWindow> = Object.freeze({
    __ELECTRON_EXPOSURE__: Object.freeze({
        buildIpcMainClient: IPC_MAIN_API.client.bind(IPC_MAIN_API),
        buildIpcPrimaryWebViewClient: PROTON_PRIMARY_IPC_WEBVIEW_API.client.bind(PROTON_PRIMARY_IPC_WEBVIEW_API),
        buildIpcCalendarWebViewClient: PROTON_CALENDAR_IPC_WEBVIEW_API.client.bind(PROTON_CALENDAR_IPC_WEBVIEW_API),
        registerDocumentClickEventListener,
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
