import {EncryptionPresets} from "fs-json-store-encryption-adapter/lib/encryption";
import {KeyDerivationPresets} from "fs-json-store-encryption-adapter/lib/key-derivation";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {Model as StoreModel} from "fs-json-store";

import {AccountConfig} from "src/shared/model/account";
import {FuzzyLocale} from "src/electron-main/spell-check/model";
import {LogLevel} from "src/shared/model/common";

export interface Config extends BaseConfig, Partial<StoreModel.StoreEntity> {
    spellCheckLocale: FuzzyLocale;
    encryptionPreset: PasswordBasedPreset;
    window: {
        maximized?: boolean;
        bounds: { x?: number; y?: number; width: number; height: number; };
    };
    fetching: {
        rateLimit: {
            intervalMs: number;
            maxInInterval: number;
        },
        messagesStorePortionSize: number;
    };
    timeouts: {
        databaseLoading: number;
        dbBootstrapping: number;
        dbSyncing: number;
        webViewApiPing: number;
        webViewBlankDOMLoaded: number;
        domElementsResolving: number;
        defaultApiCall: number;
        indexingBootstrap: number;
    };
    updateCheck: {
        releasesUrl: string;
        proxy: string;
    };
    indexingBootstrapBufferSize: number;
    jsFlags: string[];
    localDbMailsListViewMode: "plain" | "conversation";
    // base
    checkUpdateAndNotify: boolean;
    doNotRenderNotificationBadgeValue: boolean;
    hideOnClose: boolean;
    layoutMode: (typeof import("src/shared/constants").LAYOUT_MODES)[number]["value"];
    customTrayIconColor: string;
    customUnreadBgColor: string;
    customUnreadTextColor: string;
    disableSpamNotifications: boolean;
    enableHideControlsHotkey: boolean;
    findInPage: boolean;
    fullTextSearch: boolean;
    hideControls: boolean;
    idleTimeLogOutSec: number;
    logLevel: LogLevel;
    startHidden: boolean;
    unreadNotifications: boolean;
    zoomFactor: number;
}

export type BaseConfig = Pick<Config,
    | "doNotRenderNotificationBadgeValue"
    | "checkUpdateAndNotify"
    | "hideOnClose"
    | "layoutMode"
    | "customTrayIconColor"
    | "customUnreadBgColor"
    | "customUnreadTextColor"
    | "disableSpamNotifications"
    | "enableHideControlsHotkey"
    | "findInPage"
    | "fullTextSearch"
    | "hideControls"
    | "idleTimeLogOutSec"
    | "logLevel"
    | "startHidden"
    | "zoomFactor"
    | "unreadNotifications">;

export interface Settings extends Partial<StoreModel.StoreEntity> {
    accounts: AccountConfig[];
    databaseEncryptionKey: string;
    sessionStorageEncryptionKey: string;
}

export const KEY_DERIVATION_PRESETS: Record<string, KeyDerivationPresets> = {
    "node.pbkdf2 (interactive)": {type: "pbkdf2", preset: "mode:interactive|digest:sha256"},
    "node.pbkdf2 (moderate)": {type: "pbkdf2", preset: "mode:moderate|digest:sha256"},
    "node.pbkdf2 (sensitive)": {type: "pbkdf2", preset: "mode:sensitive|digest:sha256"},
    "sodium.crypto_pwhash (interactive)": {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"},
    "sodium.crypto_pwhash (moderate)": {type: "sodium.crypto_pwhash", preset: "mode:moderate|algorithm:default"},
    "sodium.crypto_pwhash (sensitive)": {type: "sodium.crypto_pwhash", preset: "mode:sensitive|algorithm:default"},
};

export const ENCRYPTION_DERIVATION_PRESETS: Record<string, EncryptionPresets> = {
    "node.crypto (aes-256-cbc)": {type: "crypto", preset: "algorithm:aes-256-cbc"},
    "sodium.crypto_secretbox_easy (default)": {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"},
};
