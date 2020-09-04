import {IPC_MAIN_API} from "src/shared/api/main";
import {Logger} from "src/shared/model/common";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/primary";
import {registerDocumentClickEventListener} from "src/electron-preload/lib/events-handling";

export type ElectronExposure = Readonly<{
    buildIpcMainClient: typeof IPC_MAIN_API.client;
    buildIpcWebViewClient: typeof PROTONMAIL_IPC_WEBVIEW_API.client;
    registerDocumentClickEventListener: typeof registerDocumentClickEventListener;
    Logger: Readonly<Logger>;
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
    vendorsAppCssLinkHref: string;
    preload: Readonly<{
        aboutBrowserWindow: string;
        browserWindow: string;
        browserWindowE2E: string;
        searchInPageBrowserView: string;
        fullTextSearchBrowserWindow: string;
        primary: string;
    }>;
    protocolBundles: ReadonlyArray<Readonly<{ scheme: string; directory: string }>>;
    webClients: ReadonlyArray<Readonly<{ entryUrl: string; entryApiUrl: string }>>;
}>;
