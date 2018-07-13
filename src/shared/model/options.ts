import {EncryptionPresets} from "fs-json-store-encryption-adapter/encryption";
import {KeyDerivationPresets} from "fs-json-store-encryption-adapter/key-derivation";
import {Model as StoreModel} from "fs-json-store";
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {AccountConfig} from "src/shared/model/account";
import {KeePassClientConfFieldContainer, KeePassRefFieldContainer} from "src/shared/model/container";

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

export interface BaseConfig {
    closeToTray?: boolean;
    compactLayout?: boolean;
    startMinimized?: boolean;
    unreadNotifications?: boolean;
    checkForUpdatesAndNotify?: boolean;
}

export interface Config extends BaseConfig, Partial<StoreModel.StoreEntity> {
    appVersion: string;
    encryptionPreset: EncryptionAdapterOptions;
    window: {
        maximized?: boolean;
        bounds: { x?: number; y?: number; width: number; height: number; };
    };
}

export interface Settings extends Partial<StoreModel.StoreEntity>,
    Partial<KeePassClientConfFieldContainer>,
    Partial<KeePassRefFieldContainer> {
    accounts: AccountConfig[];
}

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
