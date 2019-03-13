import fsExtra from "fs-extra";
import logger from "electron-log";
import path from "path";
import {constants as FsConstants} from "fs";
import {Model, Store} from "fs-json-store";
import {from} from "rxjs";
import {platform} from "os";

import {Account, Database, FindInPage, General, TrayIcon} from "./endpoints-builders";
import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API, InitResponse} from "src/shared/api/main";
import {PACKAGE_NAME, PRODUCT_NAME} from "src/shared/constants";
import {PACKAGE_NAME_V2} from "src/electron-main/api/constants";
import {attachFullTextIndexWindow, detachFullTextIndexWindow} from "src/electron-main/window/full-text-search";
import {buildSettingsAdapter} from "src/electron-main/util";
import {clearSessionsCache, initSessionByAccount} from "src/electron-main/session";
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

            if (ctx.keytarSupport) {
                if (await getPassword() === password) {
                    await setPassword(newPassword);
                } else {
                    await deletePassword();
                }
            }

            return newData;
        })()),

        init: () => from((async () => {
            let hasSavedPassword: boolean | undefined;

            try {
                hasSavedPassword = Boolean(await getPassword());
                ctx.keytarSupport = true;
            } catch (error) {
                logger.error(`"keytar" module is unsupported by the system`, error);

                ctx.keytarSupport = false;

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

            type CopyV2AppData = Required<InitResponse>["copyV2AppData"];

            const copyV2AppData: CopyV2AppData | undefined = await (async () => {
                // TODO take "fs" type into account working with files
                const snapUserDataDirRelativeToHomeRe = new RegExp(`snap\/${PACKAGE_NAME}\/x?\\d+\/\\.config\/${PACKAGE_NAME}$`);
                const isSnapPackage = platform() === "linux" && snapUserDataDirRelativeToHomeRe.test(ctx.locations.userDataDir);
                const userDataDirV2 = isSnapPackage
                    ? (() => {
                        const [homeDir] = ctx.locations.userDataDir.split(snapUserDataDirRelativeToHomeRe);
                        return path.join(homeDir, "snap", PACKAGE_NAME_V2, "current", ".config", PACKAGE_NAME_V2);
                    })()
                    : path.join(path.dirname(ctx.locations.userDataDir), PACKAGE_NAME_V2);
                const stores: Record<keyof CopyV2AppData["items"], { src: Model.Store<any>; dest: Model.Store<any> }> = {
                    config: {
                        src: new Store({file: path.join(userDataDirV2, path.basename(ctx.configStore.file))}),
                        dest: ctx.configStore,
                    },
                    settings: {
                        src: new Store({file: path.join(userDataDirV2, path.basename(ctx.settingsStore.file))}),
                        dest: ctx.settingsStore,
                    },
                    database: {
                        src: new Store({file: path.join(userDataDirV2, path.basename(ctx.db.options.file))}),
                        dest: new Store({file: ctx.db.options.file}),
                    },
                };
                const items: CopyV2AppData["items"] = {} as any;

                for (const [name, value] of Object.entries(stores)) {
                    // overriding the config file even if it exists
                    const override = (await value.dest.readable() && name === "config") || undefined;
                    const srcReadable: boolean | "denied read access" = isSnapPackage
                        ? await (async () => {
                            try {
                                return await value.src.readable();
                            } catch (error) {
                                if (error.code === "EACCES") {
                                    return "denied read access";
                                }
                                throw error;
                            }
                        })()
                        : await value.src.readable();

                    items[name as keyof typeof stores] = {
                        src: value.src.file,
                        dest: value.dest.file,
                        skip: srcReadable !== true
                            ? srcReadable || "source doesn't exist"
                            : await value.dest.readable() !== true || override
                                ? undefined
                                : "destination exists",
                        override,
                    };
                }

                const v2SnapDeniedRead = (
                    isSnapPackage
                    &&
                    // denied to read at least one file
                    Boolean(
                        Object.values(items)
                            .find(({skip}) => skip === "denied read access"),
                    )
                );

                return !items.settings.skip || v2SnapDeniedRead
                    ? {items, v2SnapDeniedRead}
                    : undefined;
            })();

            return {
                electronLocations: ctx.locations,
                keytarSupport: ctx.keytarSupport,
                snapPasswordManagerServiceHint: ctx.snapPasswordManagerServiceHint,
                hasSavedPassword,
                copyV2AppData,
            };
        })()),

        migrate: ({config, settings, database}) => from((async () => {
            for (const {skip, src, dest, override} of [config, settings, database]) {
                if (skip) {
                    continue;
                }

                await fsExtra.copyFile(src, dest, override ? 0 : FsConstants.COPYFILE_EXCL);
            }

            return null;
        })()),

        logout: () => from((async () => {
            if (ctx.keytarSupport) {
                await deletePassword();
            }
            ctx.settingsStore = ctx.settingsStore.clone({adapter: undefined});
            ctx.db.reset();
            delete ctx.selectedAccount; // TODO extend "logout" api test: "delete ctx.selectedAccount"
            await clearSessionsCache(ctx);
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

        // TODO update "readSettings" api method test ("no password provided" case, keytar support)
        readSettings: ({password, savePassword}) => from((async () => {
            // trying to auto-login
            if (!password) {
                if (!ctx.keytarSupport) {
                    throw new Error(`Wrong password saving call as unsupported by the system`);
                }
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

            return settings;
        })()),

        reEncryptSettings: ({encryptionPreset, password}) => from((async () => {
            await ctx.configStore.write({
                ...(await ctx.configStore.readExisting()),
                encryptionPreset,
            });
            return await endpoints.changeMasterPassword({password, newPassword: password}).toPromise();
        })()),

        loadDatabase: ({accounts}) => from((async () => {
            logger.info("loadDatabase() start");

            if (await ctx.db.persisted()) {
                await ctx.db.loadFromFile();
                await upgradeDatabase(ctx.db, accounts);
            }

            if ((await endpoints.readConfig().toPromise()).fullTextSearch) {
                await attachFullTextIndexWindow(ctx);
            } else {
                await detachFullTextIndexWindow(ctx);
            }

            logger.info("loadDatabase() end");

            return null;
        })()),

        settingsExists: () => from(ctx.settingsStore.readable()),

        toggleCompactLayout: () => from((async () => {
            const config = await ctx.configStore.readExisting();
            return await ctx.configStore.write({...config, compactLayout: !config.compactLayout});
        })()),
    };

    IPC_MAIN_API.registerApi(endpoints, {logger});

    ctx.deferredEndpoints.resolve(endpoints);

    return endpoints;
};
