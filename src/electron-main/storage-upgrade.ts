import compareVersions from "compare-versions";

import {APP_VERSION} from "src/shared/constants";
import {AccountConfig} from "src/shared/model/account";
import {Config, Settings} from "src/shared/model/options";
import {INITIAL_STORES} from "./constants";

const CONFIG_UPGRADES: Record<string, (config: Config) => void> = {
    "1.1.0": (config: Config & { appVersion?: string }) => {
        if (typeof config.appVersion !== "undefined") {
            delete config.appVersion;
        }
    },
    "1.2.0": (config) => {
        if (typeof config.logLevel === "undefined") {
            config.logLevel = INITIAL_STORES.config().logLevel;
        }
    },
};

const SETTINGS_UPGRADES: Record<string, (settings: Settings) => void> = {
    "1.1.1": (settings) => {
        settings.accounts.forEach((account) => {
            if (typeof account.credentials === "undefined") {
                account.credentials = {};
            }
            if (typeof account.credentialsKeePass === "undefined") {
                account.credentialsKeePass = {};
            }
        });
    },
    // TODO release: test "1.4.2" settings upgrader "dbEncryptionKey" renaming at least
    "1.4.2": (settings: Settings & { dbEncryptionKey?: string }) => {
        // rename "dbEncryptionKey" => "databaseEncryptionKey"
        if (!settings.databaseEncryptionKey) {
            settings.databaseEncryptionKey = settings.dbEncryptionKey
                ? settings.dbEncryptionKey
                : INITIAL_STORES.settings().databaseEncryptionKey;
        }

        // rename "storeMails" => "database"
        settings.accounts.forEach((account: AccountConfig & { storeMails?: boolean }) => {
            if (typeof account.database !== "undefined" || typeof account.storeMails === "undefined") {
                return;
            }
            account.database = account.storeMails;
            delete account.storeMails;
        });
    },
};

export function upgradeConfig(config: Config): boolean {
    return upgrade(config, CONFIG_UPGRADES);
}

export function upgradeSettings(settings: Settings): boolean {
    return upgrade(settings, SETTINGS_UPGRADES);
}

// TODO consider mutating entities in upgraders in an immutable way using "immer"
// and then test for changes size like "patches.length"
function upgrade<T extends Config | Settings>(entity: T, upgrades: Record<string, (entity: T) => void>): boolean {
    const input = JSON.stringify(entity);

    Object
        .keys(upgrades)
        .filter((upgraderVersion) => compareVersions(upgraderVersion, APP_VERSION) <= 0)
        .sort(compareVersions)
        .forEach((version) => upgrades[version](entity));

    return JSON.stringify(entity) !== input;
}
