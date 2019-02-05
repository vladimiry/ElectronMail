import logger from "electron-log";
import {from} from "rxjs";

import {Account, Database, FindInPage, General, TrayIcon} from "./endpoints-builders";
import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API} from "src/shared/api/main";
import {attachFullTextIndexWindow, detachFullTextIndexWindow} from "src/electron-main/window";
import {buildSettingsAdapter} from "src/electron-main/util";
import {clearDefaultSessionCaches} from "src/electron-main/session";
import {deletePassword, getPassword, setPassword} from "src/electron-main/keytar";
import {upgradeConfig, upgradeDatabase, upgradeSettings} from "src/electron-main/storage-upgrade";

export const initApi = async (ctx: Context): Promise<Endpoints> => {
    const endpoints: Endpoints = {
        ...await Account.buildEndpoints(ctx),
        ...await Database.buildEndpoints(ctx),
        ...await FindInPage.buildEndpoints(ctx),
        ...await General.buildEndpoints(ctx),
        ...await TrayIcon.buildEndpoints(ctx),

        changeMasterPassword: ({password, newPassword}) => from((async () => {
            const readStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, password)});
            const existingData = await readStore.readExisting();
            const newStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, newPassword)});
            const newData = await newStore.write(existingData, {readAdapter: ctx.settingsStore.adapter});

            ctx.settingsStore = newStore;

            if (await getPassword() === password) {
                await setPassword(newPassword);
            } else {
                await deletePassword();
            }

            return newData;
        })()),

        init: () => from((async () => {
            const hasSavedPassword = Boolean(await getPassword());

            return {
                electronLocations: ctx.locations,
                hasSavedPassword,
            };
        })()),

        logout: () => from((async () => {
            await deletePassword();
            ctx.settingsStore = ctx.settingsStore.clone({adapter: undefined});
            ctx.db.reset();
            delete ctx.selectedAccount; // TODO extend "logout" api test: "delete ctx.selectedAccount"
            await clearDefaultSessionCaches(ctx);
            await endpoints.updateOverlayIcon({hasLoggedOut: false, unread: 0}).toPromise();
            await detachFullTextIndexWindow(ctx);
            return null;
        })()),

        patchBaseConfig: (patch) => from((async () => {
            const savedConfig = await ctx.configStore.readExisting();
            const newConfig = await ctx.configStore.write({
                ...savedConfig,
                ...JSON.parse(JSON.stringify(patch)), // parse => stringify call strips out undefined values from the object
            });

            // TODO update "patchBaseConfig" api method: test "logLevel" value, "logger.transports.file.level" update
            logger.transports.file.level = newConfig.logLevel;

            // TODO update "patchBaseConfig" api method: test "attachFullTextIndexWindow" / "detachFullTextIndexWindow" calls
            if (Boolean(newConfig.fullTextSearch) !== Boolean(savedConfig.fullTextSearch)) {
                if (newConfig.fullTextSearch) {
                    await attachFullTextIndexWindow(ctx);
                } else {
                    await detachFullTextIndexWindow(ctx);
                }
            }

            return newConfig;
        })()),

        // TODO update "readConfig" api method test ("upgradeConfig" call, "logger.transports.file.level" updpate)
        readConfig: () => from((async () => {
            const store = ctx.configStore;
            const existingConfig = await store.read();
            const config = existingConfig
                ? (upgradeConfig(existingConfig) ? await store.write(existingConfig) : existingConfig)
                : await store.write(ctx.initialStores.config);

            logger.transports.file.level = config.logLevel;

            return config;
        })()),

        // TODO update "readSettings" api method test ("no password provided" case, database loading)
        readSettings: ({password, savePassword}) => from((async () => {
            // trying to auto login
            if (!password) {
                const storedPassword = await getPassword();
                if (!storedPassword) {
                    throw new Error("No password provided to decrypt settings with");
                }
                return await endpoints.readSettings({password: storedPassword}).toPromise();
            }

            const adapter = await buildSettingsAdapter(ctx, password);
            const store = ctx.settingsStore.clone({adapter});
            const existingSettings = await store.read();
            const settings = existingSettings
                ? (upgradeSettings(existingSettings) ? await store.write(existingSettings) : existingSettings)
                : await store.write(ctx.initialStores.settings);

            // "savePassword" is unset in auto login case
            if (typeof savePassword !== "undefined") {
                if (savePassword) {
                    await setPassword(password);
                } else {
                    await deletePassword();
                }
            }

            ctx.settingsStore = store;

            // TODO ensure by tests that database loaded occurs after the "ctx.settingsStore = store" assignment (see above)
            if (await ctx.db.persisted()) {
                await ctx.db.loadFromFile();
                await upgradeDatabase(ctx.db, settings);
            }

            if ((await endpoints.readConfig().toPromise()).fullTextSearch) {
                await attachFullTextIndexWindow(ctx);
            } else {
                await detachFullTextIndexWindow(ctx);
            }

            return settings;
        })()),

        reEncryptSettings: ({encryptionPreset, password}) => from((async () => {
            await ctx.configStore.write({
                ...(await ctx.configStore.readExisting()),
                encryptionPreset,
            });
            return await endpoints.changeMasterPassword({password, newPassword: password}).toPromise();
        })()),

        settingsExists: () => from(ctx.settingsStore.readable()),

        toggleCompactLayout: () => from((async () => {
            const config = await ctx.configStore.readExisting();
            return await ctx.configStore.write({...config, compactLayout: !config.compactLayout});
        })()),
    };

    IPC_MAIN_API.registerApi(endpoints, {logger: {error: logger.error, info: () => {}}});

    ctx.deferredEndpoints.resolve(endpoints);

    return endpoints;
};
