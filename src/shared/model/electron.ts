export interface ElectronExposure {
    ipcRenderer: {
        on(channel: string, listener: (event: string, response: any) => void): any;
        removeListener(channel: string, listener: (event: string, response: any) => void): any;
        send(channel: string, ...args: any[]): void;
        sendToHost(channel: string, ...args: any[]): void;
    };
}

export interface ElectronWindow {
    __ELECTRON_EXPOSURE__: ElectronExposure;
}

export type AppContextLocations = Readonly<{
    readonly app: string;
    readonly browserWindowIcon: string;
    readonly browserWindowPage: string;
    readonly trayIcon: string;
    readonly renderer: Readonly<{
        readonly browserWindow: string;
    }>;
}>;

export interface ElectronContextLocations {
    readonly app: string;
    readonly browserWindowPage: string;
    readonly icon: string;
    readonly trayIcon: string;
    readonly userData: string;
    readonly preload: {
        browserWindow: string;
        browserWindowE2E: string;
        webView: string;
    };
}
