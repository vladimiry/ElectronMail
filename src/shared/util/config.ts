import {keys} from "ts-transformer-keys";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {pick} from "remeda";

import {BaseConfig, Config} from "src/shared/model/options";
import {
    DEFAULT_API_CALL_TIMEOUT, DEFAULT_MESSAGES_STORE_PORTION_SIZE, ONE_MINUTE_MS, ONE_SECOND_MS, ZOOM_FACTOR_DEFAULT,
} from "src/shared/const";

export function initialConfig(): Config {
    {
        const encryptionPreset: PasswordBasedPreset = {
            keyDerivation: {
                type: "sodium.crypto_pwhash",
                preset: BUILD_ENVIRONMENT === "e2e"
                    ? "mode:interactive|algorithm:default"
                    : "mode:moderate|algorithm:default",
            },
            encryption: {type: "crypto", preset: "algorithm:aes-256-cbc"},
        };

        return {
            spellcheck: false,
            spellcheckLanguages: [],
            encryptionPreset,
            window: {bounds: {width: 1024, height: 768}, ...(BUILD_START_MAXIMIZED_BY_DEFAULT ? {maximized: true} : {})},
            fetching: {
                rateLimit: {
                    intervalMs: ONE_MINUTE_MS,
                    maxInInterval: 300, // gave ~80 loaded messages per minute on ~6k messages account
                },
                messagesStorePortionSize: DEFAULT_MESSAGES_STORE_PORTION_SIZE,
            },
            timeouts: {
                webViewApiPing: ONE_SECOND_MS * 15,
                webViewBlankDOMLoaded: ONE_SECOND_MS * 15,
                domElementsResolving: ONE_SECOND_MS * 20,
                defaultApiCall: DEFAULT_API_CALL_TIMEOUT,
                databaseLoading: ONE_MINUTE_MS * 5,
                indexingBootstrap: ONE_SECOND_MS * 30,
                clearSessionStorageData: ONE_SECOND_MS * 3,
                attachmentLoadAverage: ONE_MINUTE_MS * 2,
                fullTextSearch: ONE_SECOND_MS * 30,
            },
            updateCheck: {
                releasesUrl: "https://api.github.com/repos/vladimiry/ElectronMail/releases",
                proxyRules: "",
                proxyBypassRules: "",
            },
            indexingBootstrapBufferSize: 1000,
            jsFlags: ["--max-old-space-size=6144"],
            commandLineSwitches: [],
            localDbMailsListViewMode: "plain",
            zoomFactorDisabled: false,
            persistentSessionSavingInterval: ONE_MINUTE_MS * 15,
            dbSyncingIntervalTrigger: ONE_MINUTE_MS * 5,
            dbSyncingOnlineTriggerDelay: ONE_SECOND_MS * 3,
            dbSyncingFiredTriggerDebounce: ONE_SECOND_MS * 5,
            shouldRequestDbMetadataReset: "initial",
            dbCompression2: {type: "zstd", level: 3, mailsPortionSize: {min: 700, max: 900}},
            dbMergeBytesFileSizeThreshold: 1024 * 1024 * 5, // 5 MB
            // base
            checkUpdateAndNotify: false,
            customTrayIconColor: "",
            customTrayIconSize: false,
            customTrayIconSizeValue: 22,
            customUnreadBgColor: "",
            customUnreadTextColor: "",
            disableNotLoggedInTrayIndication: false,
            disableSpamNotifications: true,
            doNotRenderNotificationBadgeValue: false,
            enableHideControlsHotkey: false,
            findInPage: true,
            fullTextSearch: true,
            hideControls: false,
            hideOnClose: !BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE,
            idleTimeLogOutSec: 0,
            layoutMode: "top",
            logLevel: "error",
            startHidden: !BUILD_DISABLE_START_HIDDEN_FEATURE,
            themeSource: "system",
            unreadNotifications: true,
            zoomFactor: ZOOM_FACTOR_DEFAULT,
            suppressUpsellMessages: false,
        };
    }
}

export const pickBaseConfigProperties = (config: Config): NoExtraProps<Required<BaseConfig>> => {
    // @ts-expect-error TS 5.6.3=>5.7.2: remeda's "pick" started actiong weirdly
    return pick(config, keys<BaseConfig>());
};
