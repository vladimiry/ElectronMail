import fs from "fs";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {Model as StoreModel} from "fs-json-store";
import {platform} from "os";
import {randomBytes} from "crypto";

import {BaseConfig, Config, ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS, Settings} from "src/shared/model/options";
import {PACKAGE_NAME} from "src/shared/constants";
import {initialConfig} from "src/shared/util";

export const PLATFORM = platform();

export const INITIAL_STORES: {
    readonly config: () => StrictOmit<Config, keyof BaseConfig | "jsFlags"> & Required<BaseConfig> & Required<Pick<Config, "jsFlags">>;
    readonly settings: () => Settings;
} = Object.freeze({
    config: () => {
        // update check is disabled by default for the Snap and Flatpak package types
        const disableUpdateCheck = (
            // detect "snap" container
            (
                Boolean(process.env.SNAP)
                &&
                String(process.env.SNAP_NAME) === PACKAGE_NAME
            )
            // detect "flatpak" container
            ||
            (
                fs.existsSync("/.flatpak-info")
            )
        );
        return {
            ...initialConfig(),
            checkUpdateAndNotify: !disableUpdateCheck,
        };
    },
    settings: () => {
        return {
            accounts: [],
            databaseEncryptionKey: randomBytes(KEY_BYTES_32).toString(BASE64_ENCODING),
            sessionStorageEncryptionKey: randomBytes(KEY_BYTES_32).toString(BASE64_ENCODING),
        };
    },
});

export const configEncryptionPresetValidator: StoreModel.StoreValidator<Config> = async (data) => {
    const {keyDerivation} = data.encryptionPreset;
    const {encryption} = data.encryptionPreset;
    const errors = [
        ...(Object.values(KEY_DERIVATION_PRESETS)
            .some((value) => value.type === keyDerivation.type && value.preset === keyDerivation.preset)
            ? []
            : [`Wrong "config.encryptionPreset.keyDerivation"="${JSON.stringify(keyDerivation)}" value.`]),
        ...(Object.values(ENCRYPTION_DERIVATION_PRESETS)
            .some((value) => value.type === encryption.type && value.preset === encryption.preset)
            ? []
            : [`Wrong "config.encryptionPreset.encryption"="${JSON.stringify(encryption)}" value.`]),
    ];

    return errors.length ? errors.join(" ") : null;
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

    return duplicatedLogins.length ? `Duplicate accounts identified. Duplicated logins: ${duplicatedLogins.join(", ")}.` : null;
};
