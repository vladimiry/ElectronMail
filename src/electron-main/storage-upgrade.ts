import compareVersions from "compare-versions";

import {ACCOUNTS_CONFIG, ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX, PACKAGE_VERSION} from "src/shared/constants";
import {AccountConfig} from "src/shared/model/account";
import {Config, Settings} from "src/shared/model/options";
import {Database} from "./database";
import {DbAccountPk} from "src/shared/model/database";
import {EntryUrlItem} from "src/shared/model/common";
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
    "2.0.0-beta.7": (config) => {
        if (typeof config.timeouts === "undefined") {
            config.timeouts = INITIAL_STORES.config().timeouts;
        }
        if (!isAppVersionLessThan("2.0.0-beta.9")) {
            // "fetchingRateLimiting" for rename to "fetching.rateLimit" since "2.0.0-beta.9"
            return;
        }
        if (typeof (config as any).fetchingRateLimiting === "undefined") {
            (config as any).fetchingRateLimiting = INITIAL_STORES.config().fetching.rateLimit;
        }
    },
    "2.0.0-beta.8": (config) => {
        if (typeof config.timeouts.webViewApiPing === "undefined") {
            config.timeouts.webViewApiPing = INITIAL_STORES.config().timeouts.webViewApiPing;
        }
    },
    "2.0.0-beta.9": (config) => {
        if (typeof config.timeouts.domElementsResolving === "undefined") {
            config.timeouts.domElementsResolving = INITIAL_STORES.config().timeouts.domElementsResolving;
        }
        if (typeof config.timeouts.defaultApiCall === "undefined") {
            config.timeouts.defaultApiCall = INITIAL_STORES.config().timeouts.defaultApiCall;
        }
        if (!config.fetching) {
            config.fetching = {} as any;
        }
        if (!config.fetching.rateLimit) {
            const fetchingRateLimiting = (config as any).fetchingRateLimiting;
            config.fetching.rateLimit = typeof fetchingRateLimiting === "object"
                ? fetchingRateLimiting
                : INITIAL_STORES.config().fetching.rateLimit;
        }
        if (!config.fetching.messagesStorePortionSize) {
            config.fetching.messagesStorePortionSize = INITIAL_STORES.config().fetching.messagesStorePortionSize;
        }
    },
    "2.2.0": (config) => {
        if (typeof config.fullTextSearch === "undefined") {
            config.fullTextSearch = INITIAL_STORES.config().fullTextSearch;
        }
        if (typeof config.disableSpamNotifications === "undefined") {
            config.disableSpamNotifications = INITIAL_STORES.config().disableSpamNotifications;
        }
    },
    "2.2.1": (_, config = _ as Config & { timeouts: { syncing?: number } }) => {
        if (typeof config.timeouts.syncing !== "number") {
            config.timeouts.syncing = INITIAL_STORES.config().timeouts.dbSyncing;
        }
    },
    "2.3.1": (config) => {
        if (typeof config.clearSession === "undefined") {
            config.clearSession = INITIAL_STORES.config().clearSession;
        }
    },
    "2.3.3": (_, config = _ as Config & { timeouts: { fetching?: number; syncing?: number; } }) => {
        const defaultConfig = INITIAL_STORES.config();

        if (!Array.isArray(config.jsFlags)) {
            config.jsFlags = defaultConfig.jsFlags;
        }

        if (typeof config.timeouts.databaseLoading !== "number") {
            config.timeouts.databaseLoading = defaultConfig.timeouts.databaseLoading;
        }

        if (typeof config.timeouts.indexingBootstrap !== "number") {
            config.timeouts.indexingBootstrap = defaultConfig.timeouts.indexingBootstrap;
        }

        if (typeof config.indexingBootstrapBufferSize !== "number") {
            config.indexingBootstrapBufferSize = defaultConfig.indexingBootstrapBufferSize;
        }

        (() => {
            if (typeof config.timeouts.dbBootstrapping !== "number") {
                config.timeouts.dbBootstrapping = defaultConfig.timeouts.dbBootstrapping;
            }

            if (typeof config.timeouts.dbSyncing !== "number") {
                config.timeouts.dbSyncing = defaultConfig.timeouts.dbSyncing;
            }

            delete config.timeouts.fetching;
            delete config.timeouts.syncing;
        })();
    },
    "3.4.0": (config) => {
        if (typeof config.spellCheckLocale === "undefined") {
            config.spellCheckLocale = INITIAL_STORES.config().spellCheckLocale;
        }
    },
    "3.4.2": (_, config = _ as Config & { databaseSaveDelayMs?: number }) => {
        if (typeof config.databaseSaveDelayMs !== "undefined") {
            delete config.databaseSaveDelayMs;
        }
        if (typeof config.databaseWriteDelayMs === "undefined") {
            config.databaseWriteDelayMs = INITIAL_STORES.config().databaseWriteDelayMs;
        }
    },
};

const SETTINGS_UPGRADES: Record<string, (settings: Settings) => void> = {
    "1.1.1": (settings) => {
        settings.accounts.forEach((account) => {
            if (typeof account.credentials === "undefined") {
                account.credentials = {};
            }
            if (!isAppVersionLessThan("2.0.0")) {
                // keepass support got dropped since "2.0.0*"
                return;
            }
            if (!("credentialsKeePass" in account)) {
                (account as any).credentialsKeePass = {};
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
    "2.0.0": (settings) => {
        // dropping "online web clients" support, see https://github.com/vladimiry/ElectronMail/issues/80
        const possibleEntryUrls: string[] = Object
            .values(ACCOUNTS_CONFIG)
            .reduce((list: EntryUrlItem[], {entryUrl}) => list.concat(entryUrl), [])
            .map(({value}) => value);
        settings.accounts.forEach((account) => {
            if (possibleEntryUrls.includes(account.entryUrl)) {
                return;
            }
            account.entryUrl = `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}${account.entryUrl}`;
            if (!possibleEntryUrls.includes(account.entryUrl)) {
                throw new Error(`Invalid entry url value "${account.entryUrl}"`);
            }
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
        .filter((upgraderVersion) => compareVersions(upgraderVersion, PACKAGE_VERSION) <= 0)
        .sort(compareVersions)
        .forEach((version) => upgrades[version](entity));

    return JSON.stringify(entity) !== input;
}

function isAppVersionLessThan(version: string): boolean {
    return compareVersions(PACKAGE_VERSION, version) === -1;
}

export async function upgradeDatabase(db: Database, accounts: Settings["accounts"]) {
    let needToSave = false;

    if (db.getVersion() === "1") {
        db.reset();
        await db.saveToFile();
        return;
    }

    if (db.getVersion() === "2") {
        needToSave = true;
    }

    // removing non existent accounts
    await (async () => {
        const removePks: DbAccountPk[] = [];

        for (const {pk} of db.accountsIterator()) {
            const accountWithEnabledLocalStoreExists = accounts.some(({database, type, login}) => (
                Boolean(database)
                &&
                pk.type === type
                &&
                pk.login === login
            ));

            if (!accountWithEnabledLocalStoreExists) {
                removePks.push(pk);
            }
        }

        for (const pk of removePks) {
            db.deleteAccount(pk);
        }

        if (removePks.length) {
            needToSave = true;
        }
    })();

    if (needToSave) {
        await db.saveToFile();
    }
}
