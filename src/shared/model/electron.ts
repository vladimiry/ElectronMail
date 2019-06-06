import {InMemoryOptions, SyncOrAsyncLimiter} from "rolling-rate-limiter";

import {AccountType} from "src/shared/model/account";
import {IPC_MAIN_API} from "src/shared/api/main";
import {Logger} from "src/shared/types";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/protonmail";
import {TUTANOTA_IPC_WEBVIEW_API} from "src/shared/api/webview/tutanota";
import {registerDocumentClickEventListener} from "src/electron-preload/events-handling";

export type ElectronExposure = Readonly<{
    buildIpcMainClient: typeof IPC_MAIN_API.client;
    buildIpcWebViewClient: {
        protonmail: typeof PROTONMAIL_IPC_WEBVIEW_API.client;
        tutanota: typeof TUTANOTA_IPC_WEBVIEW_API.client;
    };
    registerDocumentClickEventListener: typeof registerDocumentClickEventListener;
    rollingRateLimiter: (options: InMemoryOptions) => SyncOrAsyncLimiter,
    Logger: Readonly<Logger>;
}>;

export interface ElectronWindow {
    // TODO generate "__ELECTRON_EXPOSURE__" prop name during the build process using the pattern like `__ELECTRON_EXPOSURE__${uuid.v4()}`
    readonly __ELECTRON_EXPOSURE__: Readonly<ElectronExposure>;
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
