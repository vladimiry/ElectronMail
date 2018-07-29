import logger from "electron-log";
import {IpcRenderer} from "electron";

import {AccountType} from "src/shared/model/account";
import {Omit} from "src/shared/types";

export interface ElectronExposure {
    ipcRendererTransport: Pick<IpcRenderer, "on" | "removeListener" | "send" | "sendToHost">;
    webLogger: Omit<typeof logger, "transports">;
    require: {
        "rolling-rate-limiter": () => (...args: any[]) => (key: string) => number,
    };
}

export interface ElectronWindow {
    __ELECTRON_EXPOSURE__: ElectronExposure;
}

export interface ElectronContextLocations {
    readonly appDir: string;
    readonly browserWindowPage: string;
    readonly icon: string;
    readonly numbersFont: string;
    readonly trayIcon: string;
    readonly userDataDir: string;
    readonly preload: {
        browserWindow: string;
        browserWindowE2E: string;
        webView: Record<AccountType, string>;
    };
}
