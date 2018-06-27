import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

const encryptionPreset: EncryptionAdapterOptions = {
    keyDerivation: {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"},
    encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"},
};

export const INITIAL_STORES = Object.freeze({
    config: {
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

export const KEYTAR_SERVICE_NAME = "protonmail-desktop-app";
export const KEYTAR_MASTER_PASSWORD_ACCOUNT = "master-password";
