import electronLog from "electron-log";
import {authenticator} from "otplib";

import * as SpellCheck from "src/electron-main/spell-check/api";
import {Account, Database, FindInPage, General, ProtonSession, TrayIcon} from "./endpoints-builders";
import {Context} from "src/electron-main/model";
import {DB_DATA_CONTAINER_FIELDS} from "src/shared/model/database";
import {IPC_MAIN_API, IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {PACKAGE_NAME, PRODUCT_NAME} from "src/shared/constants";
import {attachFullTextIndexWindow, detachFullTextIndexWindow} from "src/electron-main/window/full-text-search";
import {buildSettingsAdapter} from "src/electron-main/util";
import {clearIdleTimeLogOut, setupIdleTimeLogOut} from "src/electron-main/power-monitor";
import {curryFunctionMembers} from "src/shared/util";
import {deletePassword, getPassword, setPassword} from "src/electron-main/keytar";
import {initSessionByAccount} from "src/electron-main/session";
import {patchMetadata} from "src/electron-main/database/util";
import {upgradeDatabase, upgradeSettings} from "src/electron-main/storage-upgrade";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/index]");

export const initApi = async (ctx: Context): Promise<IpcMainApiEndpoints> => {
    const endpoints: IpcMainApiEndpoints = {
        ...await Account.buildEndpoints(ctx),
        ...await Database.buildEndpoints(ctx),
        ...await FindInPage.buildEndpoints(ctx),
        ...await General.buildEndpoints(ctx),
        ...await ProtonSession.buildEndpoints(ctx),
        ...await SpellCheck.buildEndpoints(ctx),
        ...await TrayIcon.buildEndpoints(ctx),

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async changeMasterPassword({password, newPassword}) {
            const readStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, password)});
            const existingData = await readStore.readExisting();
            const newStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, newPassword)});
            const newData = await newStore.write(existingData, {readAdapter: ctx.settingsStore.adapter});

            ctx.settingsStore = newStore;

            if (ctx.keytarSupport) {
                if (await getPassword() === password) {
                    await setPassword(newPassword);
                } else {
                    await deletePassword();
                }
            }

            return newData;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async staticInit() {
            return {
                electronLocations: ctx.locations,
            };
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async init() {
            let hasSavedPassword: boolean | undefined;

            try {
                hasSavedPassword = Boolean(await getPassword());
                ctx.keytarSupport = true;
            } catch (error) {
                // log only one-line message in "error" mode so it doesn't affect the e2e tests
                // eslint-disable-next-line  @typescript-eslint/no-unsafe-member-access
                logger.error(`"keytar" module is unsupported by the system: `, error.message);
                // log full error in "warn" mode only so it doesn't affect the e2e tests
                logger.warn(error);

                ctx.keytarSupport = false;

                // eslint-disable-next-line  @typescript-eslint/no-unsafe-member-access
                const errorMessage = String(error.message).toLowerCase();

                ctx.snapPasswordManagerServiceHint = (
                    errorMessage.includes("snap")
                    &&
                    (
                        errorMessage.includes(PACKAGE_NAME)
                        ||
                        errorMessage.includes(PRODUCT_NAME)
                    )
                    &&
                    (
                        errorMessage.includes("org.freedesktop.secret.")
                        ||
                        errorMessage.includes("gnome-keyring")
                    )
                );
            }

            return {
                keytarSupport: ctx.keytarSupport,
                snapPasswordManagerServiceHint: ctx.snapPasswordManagerServiceHint,
                hasSavedPassword,
                checkUpdateAndNotify: Boolean(
                    ctx.runtimeEnvironment === "production"
                    &&
                    (await endpoints.readConfig()).checkUpdateAndNotify,
                ),
            };
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async logout() {
            if (ctx.keytarSupport) {
                await deletePassword();
            }

            ctx.settingsStore = ctx.settingsStore.clone({adapter: undefined});
            ctx.db.reset();
            ctx.sessionDb.reset();
            ctx.sessionStorage.reset();
            delete ctx.selectedAccount; // TODO extend "logout" api test: "delete ctx.selectedAccount"

            await endpoints.updateOverlayIcon({hasLoggedOut: false, unread: 0});
            await detachFullTextIndexWindow(ctx);
            clearIdleTimeLogOut();

            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.SignedInStateChange({signedIn: false}),
            );
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async patchBaseConfig(patch) {
            const savedConfig = await ctx.configStore.readExisting();
            const newConfig = await ctx.configStore.write({
                ...savedConfig,
                ...JSON.parse(JSON.stringify(patch)), // parse => stringify call strips out undefined values from the object
            });

            // TODO update "patchBaseConfig" api method: test "logLevel" value, "logger.transports.file.level" update
            electronLog.transports.file.level = newConfig.logLevel;

            // TODO update "patchBaseConfig" api method: test "attachFullTextIndexWindow" / "detachFullTextIndexWindow" calls
            if (Boolean(newConfig.fullTextSearch) !== Boolean(savedConfig.fullTextSearch)) {
                if (newConfig.fullTextSearch) {
                    await attachFullTextIndexWindow(ctx);
                } else {
                    await detachFullTextIndexWindow(ctx);
                }
            }

            // TODO update "patchBaseConfig" api method: test "setupIdleTimeLogOut" call
            if (newConfig.idleTimeLogOutSec !== savedConfig.idleTimeLogOutSec) {
                await setupIdleTimeLogOut({idleTimeLogOutSec: newConfig.idleTimeLogOutSec});
            }

            if (newConfig.zoomFactor !== savedConfig.zoomFactor) {
                [
                    ctx.uiContext?.aboutBrowserWindow?.webContents,
                    ctx.uiContext?.browserWindow?.webContents,
                ].forEach((webContents) => {
                    if (!webContents) {
                        return;
                    }
                    webContents.zoomFactor = newConfig.zoomFactor;
                });
            }

            return newConfig;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async readConfig() {
            const store = ctx.configStore;
            const config = await store.read() ?? await store.write(ctx.initialStores.config);

            return config;
        },

        // TODO update "readSettings" api method test ("no password provided" case, keytar support)
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async readSettings({password, savePassword}) {
            // trying to auto-login
            if (!password) {
                if (!ctx.keytarSupport) {
                    throw new Error(`Wrong password saving call as unsupported by the system`);
                }
                const storedPassword = await getPassword();
                if (!storedPassword) {
                    throw new Error("No password provided to decrypt settings with");
                }
                return endpoints.readSettings({password: storedPassword});
            }

            const adapter = await buildSettingsAdapter(ctx, password);
            const store = ctx.settingsStore.clone({adapter});
            const existingSettings = await store.read();
            const settings = existingSettings
                ? (
                    upgradeSettings(existingSettings, ctx)
                        ? await store.write(existingSettings)
                        : existingSettings
                )
                : await store.write(ctx.initialStores.settings);

            // "savePassword" is unset in auto-login case
            if (typeof savePassword !== "undefined" && ctx.keytarSupport) {
                if (savePassword) {
                    await setPassword(password);
                } else {
                    await deletePassword();
                }
            }

            ctx.settingsStore = store;

            for (const {login, proxy, rotateUserAgent} of settings.accounts) {
                await initSessionByAccount(ctx, {login, proxy, rotateUserAgent});
            }

            await (async (): Promise<void> => {
                // TODO update "readSettings" api method: test "setupIdleTimeLogOut" call
                const {idleTimeLogOutSec} = await endpoints.readConfig();
                await setupIdleTimeLogOut({idleTimeLogOutSec});
            })();

            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.SignedInStateChange({signedIn: true}),
            );

            return settings;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async reEncryptSettings({encryptionPreset, password}) {
            await ctx.configStore.write({
                ...await ctx.configStore.readExisting(),
                encryptionPreset,
            });

            return endpoints.changeMasterPassword({password, newPassword: password});
        },

        // TODO move to "src/electron-main/api/endpoints-builders/database"
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async loadDatabase({accounts}) {
            logger.info("loadDatabase() start");

            const {db, sessionDb, configStore, sessionStorage} = ctx;

            // TODO move to "readSettings" method
            await sessionStorage.load(accounts.map(({login}) => login));

            if (await sessionDb.persisted()) {
                await sessionDb.loadFromFile();
                const upgraded = await upgradeDatabase(sessionDb, accounts);
                logger.verbose("loadDatabase() session database upgraded:", upgraded);
                // it will be reset and saved anyway
            }

            let needToSaveDb = false;

            if (await db.persisted()) {
                await db.loadFromFile();
                const upgraded = await upgradeDatabase(db, accounts);
                logger.verbose("loadDatabase() database upgraded:", upgraded);
                if (upgraded) {
                    needToSaveDb = true;
                }
            }

            // merging session database to the primary one
            if (await sessionDb.persisted()) {
                for (const {account: sourceAccount, pk: accountPk} of sessionDb) {
                    logger.verbose("loadDatabase() account processing iteration starts");
                    const targetAccount = db.getMutableAccount(accountPk) || db.initAccount(accountPk);

                    // inserting new/updated entities
                    for (const entityType of DB_DATA_CONTAINER_FIELDS) {
                        const patch = sourceAccount[entityType];
                        const patchSize = Object.keys(patch).length;
                        logger.verbose(`loadDatabase() patch size (${entityType}):`, patchSize);
                        if (!patchSize) {
                            // skipping iteration as the patch is empty
                            continue;
                        }
                        Object.assign(
                            targetAccount[entityType],
                            patch,
                        );
                        needToSaveDb = true;
                    }

                    // removing entities
                    for (const entityType of DB_DATA_CONTAINER_FIELDS) {
                        const deletedPks = sourceAccount.deletedPks[entityType];
                        logger.verbose("loadDatabase() removing entities count:", deletedPks.length);
                        for (const pk of deletedPks) {
                            delete targetAccount[entityType][pk];
                            needToSaveDb = true;
                        }
                    }

                    // patching metadata
                    ((): void => {
                        const metadataPatched = patchMetadata(targetAccount.metadata, sourceAccount.metadata, "loadDatabase");
                        logger.verbose(`loadDatabase() metadata patched:`, metadataPatched);
                        if (metadataPatched) {
                            needToSaveDb = true;
                        }
                    })();
                }
            }

            if (needToSaveDb) {
                await db.saveToFile();
            }

            // resetting and saving the session database
            sessionDb.reset();
            await sessionDb.saveToFile();

            if ((await configStore.readExisting()).fullTextSearch) {
                await attachFullTextIndexWindow(ctx);
            } else {
                await detachFullTextIndexWindow(ctx);
            }

            logger.info("loadDatabase() end");
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async settingsExists() {
            return ctx.settingsStore.readable();
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async generateTOTPToken({secret}) {
            return {
                token: authenticator.generate(secret),
            };
        },
    };

    IPC_MAIN_API.register(endpoints, {logger});

    ctx.deferredEndpoints.resolve(endpoints);

    return endpoints;
};
