import {ipcRenderer} from "electron";

import {ElectronWindow} from "_shared/model/electron";

const exposure: ElectronWindow = {
    __ELECTRON_EXPOSURE__: {
        ipcRenderer: {
            on: ipcRenderer.on.bind(ipcRenderer),
            removeListener: ipcRenderer.removeListener.bind(ipcRenderer),
            send: ipcRenderer.send.bind(ipcRenderer),
            sendToHost: ipcRenderer.sendToHost.bind(ipcRenderer),
        },
    },
};

Object.assign(window, exposure);
