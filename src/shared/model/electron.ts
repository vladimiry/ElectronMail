import {InMemoryOptions, SyncOrAsyncLimiter} from "rolling-rate-limiter";

import {AccountType} from "src/shared/model/account";
import {IPC_MAIN_API} from "src/shared/api/main";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/protonmail";
import {TUTANOTA_IPC_WEBVIEW_API} from "src/shared/api/webview/tutanota";
import {registerDocumentClickEventListener} from "src/electron-preload/events-handling";

export interface ElectronExposure {
    registerDocumentClickEventListener: typeof registerDocumentClickEventListener;
    buildIpcWebViewClient: {
        protonmail: typeof PROTONMAIL_IPC_WEBVIEW_API.client;
        tutanota: typeof TUTANOTA_IPC_WEBVIEW_API.client;
    };
    buildIpcMainClient: typeof IPC_MAIN_API.client;
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
    readonly aboutBrowserWindowPage: string;
    readonly searchInPageBrowserViewPage: string;
    readonly icon: string;
    readonly numbersFont: string;
    readonly trayIcon: string;
    readonly userDataDir: string;
    readonly preload: {
        aboutBrowserWindow: string;
        browserWindow: string;
        browserWindowE2E: string;
        searchInPageBrowserView: string;
        fullTextSearchBrowserWindow: string;
        webView: Record<AccountType, string>;
    };
    readonly protocolBundles: Array<{ scheme: string; directory: string }>;
    readonly webClients: Record<AccountType, Array<{ entryUrl: string; entryApiUrl: string; }>>;
}
