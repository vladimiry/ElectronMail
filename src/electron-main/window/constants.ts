import {WebPreferences} from "electron";

export const DEFAULT_WEB_PREFERENCES_KEYS = [
    "backgroundThrottling",
    "contextIsolation",
    "devTools",
    "disableBlinkFeatures",
    "enableRemoteModule",
    "nodeIntegration",
    "nodeIntegrationInWorker",
    "sandbox",
    "spellcheck",
    "webSecurity",
    "webviewTag",
] as const;

export const DEFAULT_WEB_PREFERENCES: Readonly<NoExtraProps<Pick<Required<WebPreferences>, typeof DEFAULT_WEB_PREFERENCES_KEYS[number]>>>
    = {
    backgroundThrottling: false,
    // TODO disable "contextIsolation" flag
    contextIsolation: false,
    devTools: BUILD_ENVIRONMENT !== "production",
    disableBlinkFeatures: "Auxclick",
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    sandbox: true,
    spellcheck: false,
    webSecurity: true,
    webviewTag: false,
    // TODO completely disable "remote" module (still required by "spectron")
    enableRemoteModule: BUILD_ENVIRONMENT === "e2e",
};
