import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {Model as StoreModel} from "fs-json-store";
import {platform} from "os";
import {randomBytes} from "crypto";

import {BaseConfig, Config, ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS, Settings} from "src/shared/model/options";
import {PACKAGE_NAME} from "src/shared/constants";
import {initialConfig} from "src/shared/util";

export const PLATFORM = platform();

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export const WEB_PROTOCOL_SCHEME = "web";

export const SNAP_CONTAINER = (
    Boolean(process.env.SNAP)
    &&
    String(process.env.SNAP_NAME) === PACKAGE_NAME
);

export const INITIAL_STORES: Readonly<{
    config: () => Skip<Config, keyof BaseConfig | "jsFlags"> & Required<BaseConfig> & Required<Pick<Config, "jsFlags">>;
    settings: () => Settings;
}> = Object.freeze({
    config: () => {
        return {
            ...initialConfig(),
            checkUpdateAndNotify: !SNAP_CONTAINER, // update check is disabled by default for the Snap package type
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
