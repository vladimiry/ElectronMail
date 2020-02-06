import {InMemoryOptions, SyncOrAsyncLimiter} from "rolling-rate-limiter";

import {IPC_MAIN_API} from "src/shared/api/main";
import {Logger} from "src/shared/model/common";
import {ReadonlyDeep} from "type-fest";

export type ElectronExposure = Readonly<{
    buildIpcMainClient: typeof IPC_MAIN_API.client;
    // buildIpcWebViewClient: typeof PROTONMAIL_IPC_WEBVIEW_API.client;
    rollingRateLimiter: (options: InMemoryOptions) => SyncOrAsyncLimiter,
    Logger: Readonly<Logger>;
}>;

export type ElectronWindow = NoExtraProperties<ReadonlyDeep<{
    __ELECTRON_EXPOSURE__: Readonly<ElectronExposure>;
}>>;

export type ElectronContextLocations = Readonly<{
    appDir: string;
    browserWindowPage: string;
    aboutBrowserWindowPage: string;
    searchInPageBrowserViewPage: string;
    icon: string;
    numbersFont: string;
    trayIcon: string;
    userDataDir: string;
    vendorsAppCssLinkHref: string;
    preload: Readonly<{
        aboutBrowserWindow: string;
        browserWindow: string;
        browserWindowE2E: string;
        searchInPageBrowserView: string;
        fullTextSearchBrowserWindow: string;
        primary: string;
        calendar: string;
    }>;
    protocolBundles: ReadonlyArray<Readonly<{ scheme: string; directory: string }>>;
    webClients: ReadonlyArray<Readonly<{ entryUrl: string; entryApiUrl: string; }>>;
}>;
