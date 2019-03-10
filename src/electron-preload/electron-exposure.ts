import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {ElectronWindow} from "src/shared/model/electron";
import {IPC_MAIN_API} from "src/shared/api/main";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/protonmail";
import {TUTANOTA_IPC_WEBVIEW_API} from "src/shared/api/webview/tutanota";
import {registerDocumentClickEventListener} from "src/electron-preload/events-handling";

export const ELECTRON_WINDOW: ElectronWindow = {
    __ELECTRON_EXPOSURE__: {
        registerDocumentClickEventListener,
        buildIpcMainClient: IPC_MAIN_API.buildClient.bind(IPC_MAIN_API),
        buildIpcWebViewClient: {
            protonmail: PROTONMAIL_IPC_WEBVIEW_API.buildClient.bind(PROTONMAIL_IPC_WEBVIEW_API),
            tutanota: TUTANOTA_IPC_WEBVIEW_API.buildClient.bind(TUTANOTA_IPC_WEBVIEW_API),
        },
        require: {
            "rolling-rate-limiter": () => remote.require("rolling-rate-limiter"),
        },
    },
};

export function exposeElectronStuffToWindow(): ElectronWindow {
    Object.assign(window, ELECTRON_WINDOW);
    return ELECTRON_WINDOW;
}
