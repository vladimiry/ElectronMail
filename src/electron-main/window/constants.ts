import {WebPreferences} from "electron";
import {equals} from "remeda";

export const DEFAULT_WEB_PREFERENCES_KEYS = Object.freeze([
    "backgroundThrottling",
    "disableBlinkFeatures",
    "nodeIntegration",
    "nodeIntegrationInWorker",
    "sandbox",
    "spellcheck",
    "webSecurity",
    "webviewTag",
    // TODO disable "remote" module by disabling "enableRemoteModule" option
    //      currently these things depend on it:
    //      - "rolling-rate-limiter" module
    //      - e2e tests preload script
    // enableRemoteModule: false,
] as const);

type DefaultWebPreferences = Readonly<NoExtraProperties<Pick<Required<WebPreferences>, typeof DEFAULT_WEB_PREFERENCES_KEYS[number]>>>;

export const DEFAULT_WEB_PREFERENCES: DefaultWebPreferences = Object.freeze<DefaultWebPreferences>(
    {
        backgroundThrottling: false,
        disableBlinkFeatures: "Auxclick",
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        sandbox: true,
        spellcheck: false,
        webSecurity: true,
        webviewTag: false,
    },
);

if (
    !equals(
        Object.keys(DEFAULT_WEB_PREFERENCES),
        DEFAULT_WEB_PREFERENCES_KEYS,
    )
) {
    throw new Error(`Invalid "DEFAULT_WEB_PREFERENCES" constant props detected`);
}
