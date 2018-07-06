import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

const encryptionPreset: EncryptionAdapterOptions = {
    keyDerivation: {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"},
    encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"},
};

export const INITIAL_STORES = Object.freeze({
    config: {
        appVersion: String(process.env.APP_ENV_PACKAGE_VERSION),
        encryptionPreset,
        startMinimized: true,
        compactLayout: false,
        closeToTray: true,
        unreadNotifications: true,
        checkForUpdatesAndNotify: true,
        window: {
            bounds: {width: 1024, height: 768},
        },
    },
    settings: {accounts: []},
});

export const KEYTAR_SERVICE_NAME = "email-securely-app";
export const KEYTAR_MASTER_PASSWORD_ACCOUNT = "master-password";
