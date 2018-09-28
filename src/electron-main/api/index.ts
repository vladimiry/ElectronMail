import logger from "electron-log";
import {from} from "rxjs";

import {Account, Database, General, KeePass, TrayIcon} from "./endpoints-builders";
import {Context} from "src/electron-main/model";
import {DbAccountPk} from "src/shared/model/database";
import {Endpoints, IPC_MAIN_API} from "src/shared/api/main";
import {buildSettingsAdapter} from "src/electron-main/util";
import {clearDefaultSessionCaches} from "src/electron-main/session";
import {deletePassword, getPassword, setPassword} from "src/electron-main/keytar";
import {upgradeConfig, upgradeSettings} from "src/electron-main/storage-upgrade";

export const initApi = async (ctx: Context): Promise<Endpoints> => {
    const endpoints: Endpoints = {
        ...await Account.buildEndpoints(ctx),
        ...await Database.buildEndpoints(ctx),
        ...await General.buildEndpoints(ctx),
        ...await KeePass.buildEndpoints(ctx),
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
            await clearDefaultSessionCaches();
            return null;
        })()),

        // TODO update "patchBaseConfig" api method test ("logLevel" value, "logger.transports.file.level" updpate)
        patchBaseConfig: (patch) => from((async () => {
            const config = await ctx.configStore.write({
                ...(await ctx.configStore.readExisting()),
                ...JSON.parse(JSON.stringify(patch)), // parse => stringify call strips out undefined values from the object
            });

            logger.transports.file.level = config.logLevel;

            return config;
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

                const removePks: DbAccountPk[] = [];

                ctx.db.iterateAccounts(({pk}) => {
                    if (settings.accounts.some((a) => Boolean(a.database) && a.type === pk.type && a.login === pk.login)) {
                        return;
                    }
                    removePks.push(pk);
                });

                for (const pk of removePks) {
                    ctx.db.deleteAccount(pk);
                }

                if (removePks.length) {
                    await ctx.db.saveToFile();
                }
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

    IPC_MAIN_API.registerApi(endpoints);

    return endpoints;
};
