import keytar from "keytar";
import logger from "electron-log";
import {EMPTY, from} from "rxjs";

import {AccountConfig} from "src/shared/model/account";
import {buildSettingsAdapter} from "src/electron-main/util";
import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {Database, General, KeePass, TrayIcon} from "./endpoints-builders";
import {Endpoints, IPC_MAIN_API} from "src/shared/api/main";
import {KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "src/electron-main/constants";
import {pickAccountStrict} from "src/shared/util";
import {upgradeConfig, upgradeSettings} from "src/electron-main/storage-upgrade";

export const initApi = async (ctx: Context): Promise<Endpoints> => {
    const endpoints: Endpoints = {
        ...await Database.buildEndpoints(),
        ...await General.buildEndpoints(ctx),
        ...await KeePass.buildEndpoints(ctx),
        ...await TrayIcon.buildEndpoints(ctx),

        addAccount: ({type, login, entryUrl, storeMails, credentials, credentialsKeePass}) => from((async () => {
            const account = {
                type,
                login,
                entryUrl,
                storeMails,
                credentials,
                credentialsKeePass,
            } as AccountConfig; // TODO ger rid of "TS as" casting
            const settings = await ctx.settingsStore.readExisting();

            settings.accounts.push(account);

            return await ctx.settingsStore.write(settings);
        })()),

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

        // TODO update "patchBaseSettings" api method test ("logLevel" value, "logger.transports.file.level" updpate)
        patchBaseSettings: (patch) => from((async () => {
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

        removeAccount: ({login}) => from((async () => {
            const settings = await ctx.settingsStore.readExisting();
            const account = pickAccountStrict(settings.accounts, {login});
            const index = settings.accounts.indexOf(account);

            settings.accounts.splice(index, 1);

            return await ctx.settingsStore.write(settings);
        })()),

        settingsExists: () => from(ctx.settingsStore.readable()),

        toggleCompactLayout: () => from((async () => {
            const config = await ctx.configStore.readExisting();
            return await ctx.configStore.write({...config, compactLayout: !config.compactLayout});
        })()),

        // TODO update "updateAccount" api method test (entryUrl, changed credentials structure)
        updateAccount: ({login, entryUrl, storeMails, credentials, credentialsKeePass}) => from((async () => {
            const settings = await ctx.settingsStore.readExisting();
            const account = pickAccountStrict(settings.accounts, {login});
            const {credentials: existingCredentials, credentialsKeePass: existingCredentialsKeePass} = account;

            if (typeof storeMails !== "undefined") {
                account.storeMails = storeMails;
            }

            if (typeof entryUrl !== "undefined") {
                account.entryUrl = entryUrl;
            }

            if (credentials) {
                if ("password" in credentials) {
                    existingCredentials.password = credentials.password;
                }
                if ("twoFactorCode" in credentials) {
                    existingCredentials.twoFactorCode = credentials.twoFactorCode;
                }
                if (account.type === "protonmail" && "mailPassword" in credentials) {
                    account.credentials.mailPassword = credentials.mailPassword;
                }
            }

            if (credentialsKeePass) {
                if ("password" in credentialsKeePass) {
                    existingCredentialsKeePass.password = credentialsKeePass.password;
                }
                if ("twoFactorCode" in credentialsKeePass) {
                    existingCredentialsKeePass.twoFactorCode = credentialsKeePass.twoFactorCode;
                }
                if (account.type === "protonmail" && "mailPassword" in credentialsKeePass) {
                    account.credentialsKeePass.mailPassword = credentialsKeePass.mailPassword;
                }
            }

            return await ctx.settingsStore.write(settings);
        })()),
    };

    IPC_MAIN_API.registerApi(endpoints);

    return endpoints;
};
