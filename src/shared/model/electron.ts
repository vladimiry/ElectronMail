import {InMemoryOptions, SyncOrAsyncLimiter} from "rolling-rate-limiter";
import {IpcRenderer} from "electron";

import {AccountType} from "src/shared/model/account";
import {Logger} from "src/shared/types";

export interface ElectronExposure {
    ipcRendererTransport: Pick<IpcRenderer, "on" | "removeListener" | "send" | "sendToHost">;
    webLogger: Logger;
    require: {
        "rolling-rate-limiter": () => (options: InMemoryOptions) => SyncOrAsyncLimiter;
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
    readonly webClients: Record<AccountType, Array<{ entryUrl: string; entryApiUrl: string; }>>;
}
