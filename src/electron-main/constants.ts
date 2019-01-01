import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/private/constants";
import {LogLevel} from "electron-log";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {Model as StoreModel} from "fs-json-store";
import {randomBytes} from "crypto";

import {Config, ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS, Settings} from "src/shared/model/options";
import {DEFAULT_API_CALL_TIMEOUT, ONE_SECOND_MS} from "src/shared/constants";

export const INITIAL_STORES: Readonly<{
    config: () => Config;
    settings: () => Settings;
}> = Object.freeze({
    config: () => {
        const encryptionPreset: PasswordBasedPreset = {
            keyDerivation: {type: "sodium.crypto_pwhash", preset: "mode:moderate|algorithm:default"},
            encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"},
        };
        const logLevel: LogLevel = "error";

        return {
            encryptionPreset,
            logLevel,
            startMinimized: true,
            compactLayout: true,
            closeToTray: true,
            unreadNotifications: true,
            checkForUpdatesAndNotify: true,
            findInPage: true,
            window: {
                bounds: {width: 1024, height: 768},
            },
            fetching: {
                rateLimit: {
                    // 275 requests in 60 seconds
                    intervalMs: ONE_SECOND_MS * 60,
                    maxInInterval: 275,
                },
                messagesStorePortionSize: 500,
            },
            timeouts: {
                // "fetchingRateLimiting" values need to be taking into the account defining the "fetching" timeout
                fetching: ONE_SECOND_MS * 60 * 60, // 60 minutes
                webViewApiPing: ONE_SECOND_MS * 15,
                domElementsResolving: ONE_SECOND_MS * 20,
                defaultApiCall: DEFAULT_API_CALL_TIMEOUT,
            },
        };
    },
    settings: () => {
        return {
            accounts: [],
            // TODO "databaseEncryptionKey" needs to be properly generated
            databaseEncryptionKey: randomBytes(KEY_BYTES_32).toString(BASE64_ENCODING),
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
