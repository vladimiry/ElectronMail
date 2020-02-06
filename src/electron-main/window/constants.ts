import {BrowserWindowConstructorOptions} from "electron";

export const DEFAULT_WEB_PREFERENCES: Readonly<BrowserWindowConstructorOptions["webPreferences"]> = Object.freeze(
    {
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webviewTag: true,
        webSecurity: true,
        sandbox: true,
        disableBlinkFeatures: "Auxclick",
        // TODO disable "remote" module by disabling "enableRemoteModule" option
        //      currently these things depend on it:
        //      - "rolling-rate-limiter" module
        //      - "html-to-text" module
        //      - e2e tests preload script
        // enableRemoteModule: false,
    },
);
