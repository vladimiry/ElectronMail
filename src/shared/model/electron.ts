export type ElectronExposure = Readonly<{
    buildIpcMainClient: (typeof import("src/shared/api/main-process"))["IPC_MAIN_API"]["client"];
    buildIpcPrimaryWebViewClient: (typeof import("src/shared/api/webview/primary"))["PROTON_PRIMARY_IPC_WEBVIEW_API"]["client"];
    buildIpcCalendarWebViewClient: (typeof import("src/shared/api/webview/calendar"))["PROTON_CALENDAR_IPC_WEBVIEW_API"]["client"];
    registerDocumentClickEventListener: (typeof import("src/electron-preload/lib/events-handling"))["registerDocumentClickEventListener"];
    Logger: Readonly<import("src/shared/model/common").Logger>;
}>;

export interface ElectronWindow {
    // TODO generate "__ELECTRON_EXPOSURE__" prop name during the build process using the pattern like `__ELECTRON_EXPOSURE__<UUID>`
    readonly __ELECTRON_EXPOSURE__: Readonly<ElectronExposure>;
}

export type ElectronContextLocations = Readonly<{
    appDir: string;
    browserWindowPage: string;
    aboutBrowserWindowPage: string;
    searchInPageBrowserViewPage: string;
    icon: string;
    trayIconFont: string;
    trayIcon: string;
    userDataDir: string;
    vendorsAppCssLinkHrefs: string[];
    preload: Readonly<{
        aboutBrowserWindow: string;
        browserWindow: string;
        searchInPageBrowserView: string;
        fullTextSearchBrowserWindow: string;
        primary: string;
        calendar: string;
    }>;
    protocolBundles: ReadonlyArray<Readonly<{ scheme: string; directory: string }>>;
    webClients: ReadonlyArray<Readonly<{ entryUrl: string; entryApiUrl: string }>>;
}>;
