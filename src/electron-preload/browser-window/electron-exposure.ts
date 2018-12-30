// tslint:disable-next-line:no-import-zones
import {ipcRenderer} from "electron";

import {ElectronWindow} from "src/shared/model/electron";
import {buildLoggerBundle} from "src/electron-preload/util";

// tslint:disable-next-line:no-eval
const _require = eval("require");

export const __ELECTRON_EXPOSURE__: ElectronWindow = {
    __ELECTRON_EXPOSURE__: {
        ipcRendererTransport: {
            on: ipcRenderer.on.bind(ipcRenderer),
            removeListener: ipcRenderer.removeListener.bind(ipcRenderer),
            send: ipcRenderer.send.bind(ipcRenderer),
            sendToHost: ipcRenderer.sendToHost.bind(ipcRenderer),
        },
        webLogger: buildLoggerBundle("[WEB]"),
        require: {
            "rolling-rate-limiter": () => _require("rolling-rate-limiter"),
        },
    },
};

Object.assign(window, __ELECTRON_EXPOSURE__);
