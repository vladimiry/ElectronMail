// TODO drop eslint disabling
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import _logger from "electron-log";
import compareVersions from "compare-versions";
import path from "path";

import {AccountConfig} from "src/shared/model/account";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {DB_INSTANCE_PROP_NAME} from "src/electron-main/database/constants";
import {Database} from "./database";
import {DbAccountPk} from "src/shared/model/database";
import {INITIAL_STORES} from "./constants";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {
    LAYOUT_MODES,
    PACKAGE_VERSION,
    PROTON_API_ENTRY_PRIMARY_VALUE,
    PROTON_API_ENTRY_URLS,
    PROTON_API_ENTRY_VALUE_PREFIX,
    ZOOM_FACTORS,
} from "src/shared/constants";
import {curryFunctionMembers, pickBaseConfigProperties} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/storage-upgrade]");

function isAppVersionLessThan(version: string): boolean {
    return compareVersions(PACKAGE_VERSION, version) === -1;
}

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
        if (typeof (config as any).fetchingRateLimiting === "undefined") { // eslint-disable-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            config.fetching = {} as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        }
        if (!config.fetching.rateLimit) {
            const {fetchingRateLimiting} = (config as any); // eslint-disable-line @typescript-eslint/no-explicit-any
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
    "2.3.3": (_, config = _ as Config & { timeouts: { fetching?: number; syncing?: number } }) => {
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

        ((): void => {
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
    "3.5.0": (
        _,
        config = _ as Config & { databaseSaveDelayMs?: number; checkForUpdatesAndNotify?: boolean },
    ) => {
        if (typeof config.databaseSaveDelayMs !== "undefined") {
            delete config.databaseSaveDelayMs;
        }
        if (typeof config.checkForUpdatesAndNotify !== "undefined") {
            delete config.checkForUpdatesAndNotify;
        }
        if (typeof config.checkUpdateAndNotify === "undefined") {
            config.checkUpdateAndNotify = INITIAL_STORES.config().checkUpdateAndNotify;
        }
    },
    "3.5.1": (
        _,
        config = _ as Config & { databaseWriteDelayMs?: number },
    ) => {
        if (typeof config.databaseWriteDelayMs !== "undefined") {
            delete config.databaseWriteDelayMs;
        }
    },
    "3.6.1": (
        _,
        config = _ as Config & { clearSession?: boolean; disableGpuProcess?: boolean },
    ) => {
        if (typeof config.clearSession !== "undefined") {
            delete config.clearSession;
        }
        if (typeof config.disableGpuProcess !== "undefined") {
            delete config.disableGpuProcess;
        }
        ((): void => {
            const {updateCheck: defaults} = INITIAL_STORES.config();
            if (typeof config.updateCheck === "undefined") {
                config.updateCheck = defaults;
            }
            if (typeof config.updateCheck.releasesUrl === "undefined") {
                config.updateCheck.releasesUrl = defaults.releasesUrl;
            }
            if (typeof config.updateCheck.proxy === "undefined") {
                config.updateCheck.proxy = defaults.proxy;
            }
        })();
    },
    "3.7.1": (config) => {
        if (typeof config.jsFlags === "undefined") {
            config.jsFlags = INITIAL_STORES.config().jsFlags;
        }
    },
    "3.8.0": (config) => {
        if (typeof config.idleTimeLogOutSec === "undefined") {
            config.idleTimeLogOutSec = INITIAL_STORES.config().idleTimeLogOutSec;
        }
        if (typeof config.localDbMailsListViewMode === "undefined") {
            config.localDbMailsListViewMode = INITIAL_STORES.config().localDbMailsListViewMode;
        }
    },
    "3.8.1": ({timeouts/*, ...restConfig */}) => {
        // force default "indexingBootstrap" timeout to be the minimum value
        timeouts.indexingBootstrap = Math.max(
            INITIAL_STORES.config().timeouts.indexingBootstrap,
            timeouts.indexingBootstrap,
        );
        // if (typeof restConfig.reflectSelectedAccountTitle === "undefined") {
        //     restConfig.reflectSelectedAccountTitle = INITIAL_STORES.config().reflectSelectedAccountTitle;
        // }
    },
    "4.1.0": (
        _,
        config = _ as Config & { reflectSelectedAccountTitle?: boolean },
    ) => {
        if (typeof config.reflectSelectedAccountTitle !== "undefined") {
            delete config.reflectSelectedAccountTitle;
        }
    },
    "4.2.0": (config) => {
        ((): void => {
            const key: keyof Pick<Config, "zoomFactor"> = "zoomFactor";
            if (typeof config[key] !== "number" || !ZOOM_FACTORS.includes(config[key])) {
                config[key] = INITIAL_STORES.config()[key];
            }
        })();

        ((): void => {
            const key: keyof Pick<Config, "enableHideControlsHotkey"> = "enableHideControlsHotkey";
            if (typeof config[key] === "undefined") {
                config[key] = INITIAL_STORES.config()[key];
            }
        })();
    },
    "4.2.2": (config) => {
        ((): void => {
            const key: keyof Pick<Config["timeouts"], "webViewBlankDOMLoaded"> = "webViewBlankDOMLoaded";
            if (typeof config.timeouts[key] !== "number") {
                config.timeouts[key] = INITIAL_STORES.config().timeouts[key];
            }
        })();
    },
    "4.2.3": (config) => {
        const loggerPrefix = "[config updater 4.2.3]";

        logger.info(loggerPrefix);

        function trayIconRelatedUpdate(
            {prevKey, key}:
                | Readonly<{ prevKey: "startMinimized"; key: keyof Pick<BaseConfig, "startHidden"> }>
                | Readonly<{ prevKey: "closeToTray"; key: keyof Pick<BaseConfig, "hideOnClose"> }>,
        ): void {
            if (typeof config[key] === "boolean") {
                return;
            }

            type PrevConfig = { [k in typeof prevKey]?: boolean };
            const {[prevKey]: prevValue} = config as PrevConfig;
            delete (config as PrevConfig)[prevKey];

            config[key] = typeof prevValue !== "boolean"
                ? INITIAL_STORES.config()[key]
                : prevValue;
        }

        trayIconRelatedUpdate({prevKey: "startMinimized", key: "startHidden"});
        trayIconRelatedUpdate({prevKey: "closeToTray", key: "hideOnClose"});

        ((): void => {
            const key: keyof Pick<Config, "layoutMode"> = "layoutMode";

            if (LAYOUT_MODES.some(({value}) => value === config[key])) {
                return;
            }

            type PrevConfig = Config & { compactLayout?: boolean };
            const {compactLayout} = config as PrevConfig;
            delete (config as PrevConfig).compactLayout;

            config[key] = typeof compactLayout === "boolean"
                ? compactLayout
                    ? "top"
                    : "left"
                : INITIAL_STORES.config()[key];
        })();
    },
    "4.5.0": (config) => {
        (() => {
            const key: keyof Pick<Config, "userAgents"> = "userAgents";
            if (!Array.isArray(config[key])) {
                config[key] = INITIAL_STORES.config()[key];
            }
        })();
    },
    "4.6.0": (config) => {
        (() => {
            const timeoutsKey: keyof Pick<Config["timeouts"], "clearSessionStorageData"> = "clearSessionStorageData";
            if (typeof config.timeouts[timeoutsKey] !== "number") {
                config.timeouts[timeoutsKey] = INITIAL_STORES.config().timeouts[timeoutsKey];
            }
        })();
    },
    "4.8.0": (
        _,
        config = _ as Config & { timeouts: {singleAttachmentLoad?: number } },
    ) => {
        (() => {
            delete config.timeouts.singleAttachmentLoad;
            const timeoutsKey: keyof Pick<Config["timeouts"], "attachmentLoadAverage"> = "attachmentLoadAverage";
            if (typeof config.timeouts[timeoutsKey] !== "number") {
                config.timeouts[timeoutsKey] = INITIAL_STORES.config().timeouts[timeoutsKey];
            }
        })();
        (() => {
            const timeoutsKey: keyof Pick<Config["timeouts"], "fullTextSearch"> = "fullTextSearch";
            if (typeof config.timeouts[timeoutsKey] !== "number") {
                config.timeouts[timeoutsKey] = INITIAL_STORES.config().timeouts[timeoutsKey];
            }
        })();
    },
    // WARN needs to be the last updater
    "100.0.0": (config) => {
        // ensuring default base props are set
        Object.assign(
            config,
            {
                ...pickBaseConfigProperties(INITIAL_STORES.config()),
                // "stringify => parse" drops "undefined" values
                ...JSON.parse(
                    JSON.stringify(
                        pickBaseConfigProperties(config),
                    ),
                ),
            },
        );
    },
};

// TODO consider mutating entities in upgraders in an immutable way using "immer"
// and then test for changes size like "patches.length"
function upgrade<T extends Config | Settings>(entity: T, upgrades: Record<string, (entity: T) => void>): boolean {
    const input = JSON.stringify(entity);

    Object
        .keys(upgrades)
        .sort(compareVersions)
        .forEach((version) => upgrades[version](entity));

    return JSON.stringify(entity) !== input;
}

export function upgradeConfig(config: Config): boolean {
    return upgrade(config, CONFIG_UPGRADES);
}

export const upgradeSettings: (settings: Settings, ctx: Context) => boolean = ((): typeof upgradeSettings => {
    function buildSettingsUpgraders(ctx: Context): Record<string, (settings: Settings) => void> {
        return {
            "1.1.1": (settings): void => {
                settings.accounts.forEach((account) => {
                    if (typeof account.credentials === "undefined") {
                        account.credentials = {};
                    }
                    if (!isAppVersionLessThan("2.0.0")) {
                        // keepass support got dropped since "2.0.0*"
                        return;
                    }
                    if (!("credentialsKeePass" in account)) {
                        (account as any) // eslint-disable-line @typescript-eslint/no-explicit-any
                            .credentialsKeePass = {};
                    }
                });
            },
            // TODO release: test "1.4.2" settings upgrader "dbEncryptionKey" renaming at least
            "1.4.2": (settings: Settings & { dbEncryptionKey?: string }): void => {
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
            // "2.0.0": (settings) => {
            //     // dropping "online web clients" support, see https://github.com/vladimiry/ElectronMail/issues/80
            //     settings.accounts.forEach((account) => {
            //         if (PROTON_API_ENTRY_URLS.includes(account.entryUrl)) {
            //             return;
            //         }
            //         account.entryUrl = `${PROTON_API_ENTRY_VALUE_PREFIX}${account.entryUrl}`;
            //     });
            // },
            "3.5.0": (settings): void => {
                // dropping https://beta.protonmail.com entry point, see https://github.com/vladimiry/ElectronMail/issues/164
                settings.accounts.forEach((account) => {
                    // it can be either "https://beta.protonmail.com" or "local:::https://beta.protonmail.com"
                    // since above defined "2.0.0" upgrade adds "local:::"
                    if (account.entryUrl.includes("https://beta.protonmail.com")) { // lgtm [js/incomplete-url-substring-sanitization]
                        account.entryUrl = PROTON_API_ENTRY_PRIMARY_VALUE;
                    }
                    // if (
                    //     !PROTON_API_ENTRY_URLS.includes(account.entryUrl)
                    //     &&
                    //     !account.entryUrl.includes("https://mail.tutanota.com") // tutanota accounts will be dropped by "4.0.0" upgrader
                    // ) {
                    //     throw new Error(`Invalid entry url value "${account.entryUrl}"`);
                    // }
                });
            },
            "4.0.0": (settings): void => {
                const protonmailAccounts = settings.accounts.filter((account) => {
                    const {type} = account as unknown as { type?: string };
                    return !type || type === "protonmail";
                });
                const totalAccountsCount = settings.accounts.length;
                const tutanotaAccountsCount = totalAccountsCount - protonmailAccounts.length;

                if (tutanotaAccountsCount < 1) {
                    return;
                }

                const originalFile = ctx.settingsStore.file;
                const backupFile = path.join(
                    path.dirname(originalFile),
                    `${path.basename(originalFile)}.tutanota-backup-${Number(new Date())}`,
                );
                const message = [
                    `Count of Tutanota accounts removed from ${originalFile} file: ${tutanotaAccountsCount}.`,
                    `Backup file saved: ${backupFile} (please consider removing it manually).`,
                ].join(" ");

                ctx.settingsStore.fs._impl.copyFileSync(originalFile, backupFile);

                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.InfoMessage({message}),
                );

                logger.debug(message);

                // required data mutation
                settings.accounts = protonmailAccounts;
            },
            "4.2.0": (settings): void => {
                ((): void => {
                    const key: keyof Pick<Settings, "sessionStorageEncryptionKey"> = "sessionStorageEncryptionKey";
                    if (!settings[key]) {
                        settings[key] = INITIAL_STORES.settings()[key];
                    }
                })();

                settings.accounts.forEach((account, index) => {
                    delete (account as unknown as { type?: string }).type;

                    if (account.entryUrl.startsWith(PROTON_API_ENTRY_VALUE_PREFIX)) {
                        account.entryUrl = account.entryUrl.substr(PROTON_API_ENTRY_VALUE_PREFIX.length);
                    }

                    if (!PROTON_API_ENTRY_URLS.includes(account.entryUrl)) {
                        throw new Error(`Invalid entry url value: "${account.entryUrl}" (account index: ${index})`);
                    }
                });
            },
        };
    }

    const result: typeof upgradeSettings = (settings, ctx) => {
        return upgrade(settings, buildSettingsUpgraders(ctx));
    };

    return result;
})();

export async function upgradeDatabase(db: Database, accounts: Settings["accounts"]): Promise<boolean> {
    let needToSave = false;

    if (db.getVersion() === "1") {
        db.reset();
        return true;
    }

    if (db.getVersion() === "2") {
        needToSave = true;
    }

    if (Number(db.getVersion()) < 4) {
        for (const {account} of db) {
            if (typeof account.deletedPks !== "undefined") {
                continue;
            }
            (account as Mutable<Pick<typeof account, "deletedPks">>).deletedPks = {
                conversationEntries: [],
                mails: [],
                folders: [],
                contacts: [],
            };
            needToSave = true;
        }
    }

    if (Number(db.getVersion()) < 5) {
        const dbInstance = (db as any)[DB_INSTANCE_PROP_NAME]; // eslint-disable-line @typescript-eslint/no-explicit-any
        dbInstance.accounts = dbInstance.accounts.protonmail ?? Database.buildEmptyDb().accounts;
        needToSave = true;
    }

    if (Number(db.getVersion()) < 6) {
        for (const {account} of db) {
            for (const [/* folderPk */, folder] of Object.entries(account.folders)) {
                if (typeof folder.exclusive === "number") {
                    continue;
                }
                type RawFolder = Pick<import("src/electron-preload/webview/lib/rest-model/response-entity/folder").Label, "Exclusive">;
                const rawRestResponseFolder: Readonly<RawFolder> = JSON.parse(folder.raw);
                (folder as Mutable<Pick<typeof folder, "exclusive">>).exclusive = rawRestResponseFolder.Exclusive;
                if (typeof folder.exclusive !== "number") {
                    throw new Error(`Failed to resolve "rawFolder.Exclusive" numeric property`);
                }
                needToSave = true;
            }
        }
    }

    // removing non existent accounts
    await (async (): Promise<void> => {
        const removePks: DbAccountPk[] = [];

        for (const {pk} of db) {
            const accountWithEnabledLocalStoreExists = accounts.some(({database, login}) => (
                Boolean(database)
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

    return needToSave;
}
