import {InMemoryOptions, SyncOrAsyncLimiter} from "rolling-rate-limiter";

import {AccountType} from "src/shared/model/account";
import {IPC_MAIN_API} from "src/shared/api/main";
import {buildLoggerBundle} from "src/electron-preload/util";

export interface ElectronExposure {
    buildLoggerBundle: typeof buildLoggerBundle;
    buildIpcMainClient: typeof IPC_MAIN_API.buildClient;
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
    readonly searchInPageBrowserViewPage: string;
    readonly icon: string;
    readonly numbersFont: string;
    readonly trayIcon: string;
    readonly userDataDir: string;
    readonly preload: {
        browserWindow: string;
        browserWindowE2E: string;
        searchInPageBrowserView: string;
        fullTextSearchBrowserWindow: string;
        webView: Record<AccountType, string>;
    };
    readonly protocolBundles: Array<{ scheme: string; directory: string }>;
    readonly webClients: Record<AccountType, Array<{ entryUrl: string; entryApiUrl: string; }>>;
}
