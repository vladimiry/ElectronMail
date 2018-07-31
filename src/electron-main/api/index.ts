import keytar from "keytar";
import logger from "electron-log";
import {EMPTY, from} from "rxjs";

import {Account, Database, General, KeePass, TrayIcon} from "./endpoints-builders";
import {buildSettingsAdapter} from "src/electron-main/util";
import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API} from "src/shared/api/main";
import {KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "src/electron-main/constants";
import {upgradeConfig, upgradeSettings} from "src/electron-main/storage-upgrade";

export const initApi = async (ctx: Context): Promise<Endpoints> => {
    const endpoints: Endpoints = {
        ...await Account.buildEndpoints(ctx),
        ...await Database.buildEndpoints(),
        ...await General.buildEndpoints(ctx),
        ...await KeePass.buildEndpoints(ctx),
        ...await TrayIcon.buildEndpoints(ctx),

        changeMasterPassword: ({password, newPassword}) => from((async () => {
            const readStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, password)});
            const existingData = await readStore.readExisting();
            const newStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, newPassword)});
            const newData = await newStore.write(existingData, {readAdapter: ctx.settingsStore.adapter});

            ctx.settingsStore = newStore;

            if (await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT) === password) {
                await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, newPassword);
            } else {
                await keytar.deletePassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
            }

            return newData;
        })()),

        init: () => from((async () => {
            const hasSavedPassword = Boolean(await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT));

            return {
                electronLocations: ctx.locations,
                hasSavedPassword,
            };
        })()),

        logout: () => from((async () => {
            await keytar.deletePassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
            ctx.settingsStore = ctx.settingsStore.clone({adapter: undefined});
            return EMPTY.toPromise();
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
            let config: Config | null = await ctx.configStore.read();

            if (!config) {
                config = await ctx.configStore.write(ctx.initialStores.config);
            } else if (upgradeConfig(config)) {
                config = await ctx.configStore.write(config);
            }

            logger.transports.file.level = config.logLevel;

            return config;
        })()),

        // TODO update "readSettings" api method test ("upgradeSettings" call, "no password provided" case)
        readSettings: ({password, savePassword}) => from((async () => {
            // trying to auto login
            if (!password) {
                const storedPassword = await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);

                if (!storedPassword) {
                    throw new Error("No password provided to decrypt settings with");
                }

                return await endpoints.readSettings({password: storedPassword}).toPromise();
            }

            const adapter = await buildSettingsAdapter(ctx, password);
            const store = ctx.settingsStore.clone({adapter});
            const settings = await (async () => {
                const entity = await store.read();

                if (entity) {
                    if (upgradeSettings(entity)) {
                        return store.write(entity);
                    }
                    return entity;
                }

                return store.write(ctx.initialStores.settings);
            })();

            // "savePassword" is unset in auto login case
            if (typeof savePassword !== "undefined") {
                if (savePassword) {
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, password);
                } else {
                    await keytar.deletePassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
                }
            }

            ctx.settingsStore = store;

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
