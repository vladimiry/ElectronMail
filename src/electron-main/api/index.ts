import electronLog from "electron-log";

import * as SpellCheck from "src/electron-main/spell-check/api";
import {Account, Database, FindInPage, General, TrayIcon} from "./endpoints-builders";
import {Context} from "src/electron-main/model";
import {IPC_MAIN_API, IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {PACKAGE_NAME, PRODUCT_NAME} from "src/shared/constants";
import {attachFullTextIndexWindow, detachFullTextIndexWindow} from "src/electron-main/window/full-text-search";
import {buildSettingsAdapter} from "src/electron-main/util";
import {clearSessionsCache, initSessionByAccount} from "src/electron-main/session";
import {curryFunctionMembers} from "src/shared/util";
import {deletePassword, getPassword, setPassword} from "src/electron-main/keytar";
import {upgradeConfig, upgradeDatabase, upgradeSettings} from "src/electron-main/storage-upgrade";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/index]");

export const initApi = async (ctx: Context): Promise<IpcMainApiEndpoints> => {
    const endpoints: IpcMainApiEndpoints = {
        ...await Account.buildEndpoints(ctx),
        ...await Database.buildEndpoints(ctx),
        ...await FindInPage.buildEndpoints(ctx),
        ...await General.buildEndpoints(ctx),
        ...await TrayIcon.buildEndpoints(ctx),
        ...await SpellCheck.buildEndpoints(ctx),

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

        async init() {
            let hasSavedPassword: boolean | undefined;

            try {
                hasSavedPassword = Boolean(await getPassword());
                ctx.keytarSupport = true;
            } catch (error) {
                logger.error(`"keytar" module is unsupported by the system`, error);

                ctx.keytarSupport = false;

                const errorMessage = String(error.message)
                    .toLowerCase();

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
                electronLocations: ctx.locations,
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

        async logout() {
            if (ctx.keytarSupport) {
                await deletePassword();
            }

            ctx.settingsStore = ctx.settingsStore.clone({adapter: undefined});
            ctx.db.reset();
            delete ctx.selectedAccount; // TODO extend "logout" api test: "delete ctx.selectedAccount"

            await clearSessionsCache(ctx);
            await endpoints.updateOverlayIcon({hasLoggedOut: false, unread: 0});
            await detachFullTextIndexWindow(ctx);

            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.SignedInStateChange({signedIn: false}),
            );
        },

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

            return newConfig;
        },

        // TODO update "readConfig" api method test ("upgradeConfig" call, "logger.transports.file.level" updpate)
        async readConfig() {
            const store = ctx.configStore;
            const existingConfig = await store.read();
            const config = existingConfig
                ? (upgradeConfig(existingConfig) ? await store.write(existingConfig) : existingConfig)
                : await store.write(ctx.initialStores.config);

            electronLog.transports.file.level = config.logLevel;

            return config;
        },

        // TODO update "readSettings" api method test ("no password provided" case, keytar support)
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
                    upgradeSettings(existingSettings)
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

            for (const {login, proxy} of settings.accounts) {
                await initSessionByAccount(ctx, {login, proxy});
            }

            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.SignedInStateChange({signedIn: true}),
            );

            return settings;
        },

        async reEncryptSettings({encryptionPreset, password}) {
            await ctx.configStore.write({
                ...(await ctx.configStore.readExisting()),
                encryptionPreset,
            });

            return await endpoints.changeMasterPassword({password, newPassword: password});
        },

        async loadDatabase({accounts}) {
            logger.info("loadDatabase() start");

            if (await ctx.db.persisted()) {
                await ctx.db.loadFromFile();
                await upgradeDatabase(ctx.db, accounts);
            }

            if ((await ctx.configStore.readExisting()).fullTextSearch) {
                await attachFullTextIndexWindow(ctx);
            } else {
                await detachFullTextIndexWindow(ctx);
            }

            logger.info("loadDatabase() end");
        },

        async settingsExists() {
            return ctx.settingsStore.readable();
        },

        async toggleCompactLayout() {
            const config = await ctx.configStore.readExisting();

            return await ctx.configStore.write({...config, compactLayout: !config.compactLayout});
        },
    };

    IPC_MAIN_API.register(endpoints);

    ctx.deferredEndpoints.resolve(endpoints);

    return endpoints;
};
