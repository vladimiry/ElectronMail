import {LogLevel} from "electron-log";
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {APP_NAME} from "src/shared/constants";
import {Config, Settings} from "src/shared/model/options";
import {ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS} from "../shared/model/options";
import {Model as StoreModel} from "fs-json-store";

export const KEYTAR_SERVICE_NAME = APP_NAME;
export const KEYTAR_MASTER_PASSWORD_ACCOUNT = "master-password";

export const INITIAL_STORES: { config: Config; settings: Settings; } = (() => {
    const encryptionPreset: EncryptionAdapterOptions = {
        keyDerivation: {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"},
        encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"},
    };
    const logLevel: LogLevel = "error";

    return Object.freeze({
        config: {
            encryptionPreset,
            logLevel,
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
})();

export const configEncryptionPresetValidator: StoreModel.StoreValidator<Config> = async (data) => {
    const keyDerivation = data.encryptionPreset.keyDerivation;
    const encryption = data.encryptionPreset.encryption;

    const errors = [
        ...(Object.values(KEY_DERIVATION_PRESETS)
            .some((value) => value.type === keyDerivation.type && value.preset === keyDerivation.preset)
            ? []
            : [`Wrong "config.encryptionPreset.keyDerivation"="${keyDerivation}" value.`]),
        ...(Object.values(ENCRYPTION_DERIVATION_PRESETS)
            .some((value) => value.type === encryption.type && value.preset === encryption.preset)
            ? []
            : [`Wrong "config.encryptionPreset.encryption"="${encryption}" value.`]),
    ];

    return Promise.resolve(
        errors.length
            ? errors.join(" ")
            : null,
    );
};

export const settingsAccountLoginUniquenessValidator: StoreModel.StoreValidator<Settings> = async (data) => {
    const duplicatedLogins = data.accounts
        .map((account) => account.login)
        .reduce((duplicated: string[], el, i, logins) => {
            if (logins.indexOf(el) !== i && duplicated.indexOf(el) === -1) {
                duplicated.push(el);
            }
            return duplicated;
        }, []);
    const result = duplicatedLogins.length
        ? `Duplicate accounts identified. Duplicated logins: ${duplicatedLogins.join(", ")}.`
        : null;

    return Promise.resolve(result);
};
