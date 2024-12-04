export type ElectronExposure = Readonly<
    {
        buildIpcMainClient: (typeof import("src/shared/api/main-process"))["IPC_MAIN_API"]["client"];
        buildIpcPrimaryCommonWebViewClient:
            (typeof import("src/shared/api/webview/primary-common"))["PROTON_PRIMARY_COMMON_IPC_WEBVIEW_API"]["client"];
        buildIpcPrimaryMailWebViewClient:
            (typeof import("src/shared/api/webview/primary-mail"))["PROTON_PRIMARY_MAIL_IPC_WEBVIEW_API"]["client"];
        buildIpcPrimaryLoginWebViewClient:
            (typeof import("src/shared/api/webview/primary-login"))["PROTON_PRIMARY_LOGIN_IPC_WEBVIEW_API"]["client"];
        registerDocumentClickEventListener:
            (typeof import("src/electron-preload/lib/events-handling"))["registerDocumentClickEventListener"];
        Logger: Readonly<import("src/shared/model/common").Logger>;
    }
>;

export interface ElectronWindow {
    // TODO generate "__ELECTRON_EXPOSURE__" prop name during the build process using the pattern like `__ELECTRON_EXPOSURE__<UUID>`
    readonly __ELECTRON_EXPOSURE__: Readonly<ElectronExposure>;
}

export type ElectronContextLocations = Readonly<
    {
        appDir: string;
        browserWindowPage: string;
        aboutBrowserWindowPage: string;
        searchInPageBrowserViewPage: string;
        icon: string;
        trayIconFont: string;
        trayIcon: string;
        userDataDir: string;
        vendorsAppCssLinkHrefs: string[];
        preload: Readonly<
            {
                aboutBrowserWindow: string;
                browserWindow: string;
                searchInPageBrowserView: string;
                fullTextSearchBrowserWindow: string;
                primary: string;
            }
        >;
    }
>;
