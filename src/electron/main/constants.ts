import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

// tslint:disable:no-var-requires
const packageJSON = require("_root/package.json");
// tslint:enable:no-var-requires

export const INITIAL_STORES = Object.freeze({
    config: {
        encryptionPreset: {
            keyDerivation: {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"},
            encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"},
        } as EncryptionAdapterOptions,
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

export const KEYTAR_SERVICE_NAME = packageJSON.name;
export const KEYTAR_MASTER_PASSWORD_ACCOUNT = "master-password";
