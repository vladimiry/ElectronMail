import {AccountType} from "_@shared/model/account";

export interface ElectronExposure {
    ipcRenderer: {
        on(channel: string, listener: (event: string, response: any) => void): any;
        removeListener(channel: string, listener: (event: string, response: any) => void): any;
        send(channel: string, ...args: any[]): void;
        sendToHost(channel: string, ...args: any[]): void;
    };
    requireNodeRollingRateLimiter: () => (...args: any[]) => (key: string) => number;
}

export interface ElectronWindow {
    __ELECTRON_EXPOSURE__: ElectronExposure;
}

export interface ElectronContextLocations {
    readonly app: string;
    readonly browserWindowPage: string;
    readonly icon: string;
    readonly trayIcon: string;
    readonly trayIconUnreadOverlay: string;
    readonly trayIconLoggedOutOverlay: string;
    readonly userData: string;
    readonly preload: {
        browserWindow: string;
        browserWindowE2E: string;
        webView: Record<AccountType, string>;
    };
}
