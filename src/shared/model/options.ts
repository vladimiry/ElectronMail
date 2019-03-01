import {EncryptionPresets} from "fs-json-store-encryption-adapter/encryption";
import {KeyDerivationPresets} from "fs-json-store-encryption-adapter/key-derivation";
import {LogLevel} from "electron-log";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {Model as StoreModel} from "fs-json-store";

import {AccountConfig} from "src/shared/model/account";

export interface Config extends BaseConfig, Partial<StoreModel.StoreEntity> {
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
        domElementsResolving: number;
        defaultApiCall: number;
        indexingBootstrap: number;
    };
    indexingBootstrapBufferSize: number;
    disableGpuProcess: boolean;
    jsFlags?: string[];
    // base
    checkForUpdatesAndNotify?: boolean;
    clearSession?: boolean;
    closeToTray?: boolean;
    compactLayout?: boolean;
    customUnreadBgColor?: string;
    customUnreadTextColor?: string;
    disableSpamNotifications?: boolean;
    findInPage?: boolean;
    fullTextSearch?: boolean;
    logLevel: LogLevel;
    startMinimized?: boolean;
    unreadNotifications?: boolean;
}

export type BaseConfig = Pick<Config,
    | "checkForUpdatesAndNotify"
    | "clearSession"
    | "closeToTray"
    | "compactLayout"
    | "customUnreadBgColor"
    | "customUnreadTextColor"
    | "disableSpamNotifications"
    | "findInPage"
    | "fullTextSearch"
    | "logLevel"
    | "startMinimized"
    | "unreadNotifications">;

export interface Settings extends Partial<StoreModel.StoreEntity> {
    accounts: AccountConfig[];
    databaseEncryptionKey: string;
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
