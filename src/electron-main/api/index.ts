import {authenticator} from "otplib";
import electronLog from "electron-log";
import {first} from "rxjs/operators";
import fs from "fs";
import {lastValueFrom} from "rxjs";
import {noop} from "remeda";
import path from "path";
import UUID from "pure-uuid";

import {applySpellcheckOptionsChange} from "src/electron-main/web-contents";
import {applyThemeSource} from "src/electron-main/native-theme";
import {applyZoomFactor} from "src/electron-main/window/util";
import {attachFullTextIndexWindow, detachFullTextIndexWindow} from "src/electron-main/window/full-text-search";
import {buildSettingsAdapter} from "src/electron-main/util";
import {clearIdleTimeLogOut, setupIdleTimeLogOut} from "src/electron-main/power-monitor";
import {Context} from "src/electron-main/model";
import {curryFunctionMembers} from "src/shared/util";
import {Database} from "src/electron-main/database";
import {deletePassword, getPassword, setPassword} from "src/electron-main/keytar";
import * as EndpointsBuilders from "./endpoints-builders";
import {initAccountSessions} from "src/electron-main/session";
import {IPC_MAIN_API, IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main-process";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/const";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {PACKAGE_NAME, PRODUCT_NAME, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION} from "src/shared/const";
import {PLATFORM} from "src/electron-main/constants";
import {upgradeDatabase, upgradeSettings} from "src/electron-main/storage-upgrade";

const logger = curryFunctionMembers(electronLog, __filename);

export const initApiEndpoints = async (ctx: Context): Promise<IpcMainApiEndpoints> => {
    const endpoints: IpcMainApiEndpoints = {
        ...await EndpointsBuilders.Account.buildEndpoints(ctx),
        ...await EndpointsBuilders.Database.buildEndpoints(ctx),
        ...await EndpointsBuilders.FindInPage.buildEndpoints(ctx),
        ...await EndpointsBuilders.General.buildEndpoints(ctx),
        ...await EndpointsBuilders.ProtonSession.buildEndpoints(ctx),
        ...await EndpointsBuilders.TrayIcon.buildEndpoints(ctx),
        ...await EndpointsBuilders.UnreadNotification.buildDbUnreadNotificationEndpoints(ctx),

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async changeMasterPassword({password, newPassword}) {
            const result = await ctx.settingsStoreQueue.q(async () => {
                const readStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, password)});
                const existingData = await readStore.readExisting();
                const newStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, newPassword)});
                const newData = await newStore.write(existingData, {readAdapter: ctx.settingsStore.adapter});

                return {newStore, newData};
            });

            ctx.settingsStore = result.newStore;

            if (ctx.keytarSupport) {
                if (await getPassword() === password) {
                    await setPassword(newPassword);
                } else {
                    await deletePassword();
                }
            }

            return result.newData;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async staticInit() {
            const fsPromise = await import("fs/promises");
            const monacoEditorExtraLibArgs: IpcMainServiceScan["ApiImplReturns"]["staticInit"]["monacoEditorExtraLibArgs"]
                = {system: [""], protonMessage: [""]};

            for (const key of Object.keys(monacoEditorExtraLibArgs) as Array<keyof typeof monacoEditorExtraLibArgs>) {
                // TODO read file once (cache the content)
                const fileContent = await fsPromise.readFile(
                    path.join(ctx.locations.appDir, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION[key]),
                );
                monacoEditorExtraLibArgs[key] = [
                    fileContent.toString(),
                    PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION[key],
                ];
            }

            return {
                electronLocations: ctx.locations,
                monacoEditorExtraLibArgs,
                os: {platform: PLATFORM},
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
                logger.error(
                    nameof(endpoints.init),
                    `"keytar" module is unsupported by the system: `,
                    (Object(error) as { message?: string }).message,
                );
                // log full error in "warn" mode only so it doesn't affect the e2e tests
                logger.warn(nameof(endpoints.init), error);

                ctx.keytarSupport = false;

                // eslint-disable-next-line  @typescript-eslint/no-unsafe-member-access
                const errorMessage = String((Object(error) as { message?: string }).message).toLowerCase();

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
                    BUILD_ENVIRONMENT !== "e2e"
                    &&
                    (await endpoints.readConfig()).checkUpdateAndNotify,
                ),
            };
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async logout({skipKeytarProcessing}) {
            if (!skipKeytarProcessing && ctx.keytarSupport) {
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
            const {updated: updatedConfig, previous: previousConfig} = await ctx.configStoreQueue.q(async () => {
                const previous = await ctx.configStore.readExisting();
                const updated = await ctx.configStore.write({ // eslint-disable-line @typescript-eslint/no-unsafe-argument
                    ...previous,
                    ...JSON.parse(JSON.stringify(patch)), // parse => stringify call strips out undefined values from the object
                });
                return {previous, updated};
            });

            electronLog.transports.file.level = updatedConfig.logLevel;

            if (Boolean(updatedConfig.fullTextSearch) !== Boolean(previousConfig.fullTextSearch)) {
                if (updatedConfig.fullTextSearch) {
                    await attachFullTextIndexWindow(ctx);
                } else {
                    await detachFullTextIndexWindow(ctx);
                }
            }

            if (updatedConfig.idleTimeLogOutSec !== previousConfig.idleTimeLogOutSec) {
                await setupIdleTimeLogOut({idleTimeLogOutSec: updatedConfig.idleTimeLogOutSec});
            }

            if (updatedConfig.zoomFactor !== previousConfig.zoomFactor) {
                const uiContext = ctx.uiContext && await ctx.uiContext;
                for (const webContents of [
                    uiContext?.aboutBrowserWindow?.webContents,
                    uiContext?.browserWindow?.webContents,
                ]) {
                    if (webContents) {
                        await applyZoomFactor(ctx, webContents);
                    }
                }
            }

            if (updatedConfig.themeSource !== previousConfig.themeSource) {
                applyThemeSource(updatedConfig.themeSource);
            }

            if (updatedConfig.spellcheck !== previousConfig.spellcheck) {
                await applySpellcheckOptionsChange(ctx, {enabled: updatedConfig.spellcheck, skipConfigSaving: true});
            }

            return updatedConfig;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async readConfig() {
            return await ctx.configStore.read()
                ?? ctx.configStoreQueue.q(async () => ctx.configStore.write(ctx.initialStores.config));
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
            const settings = await ctx.settingsStoreQueue.q(async () => {
                const existingSettings = await store.read();
                return existingSettings
                    ? (
                        upgradeSettings(existingSettings, ctx)
                            ? store.write(existingSettings)
                            : existingSettings
                    )
                    : store.write(ctx.initialStores.settings);
            });

            // "savePassword" is unset in auto-login case
            if (typeof savePassword !== "undefined" && ctx.keytarSupport) {
                if (savePassword) {
                    await setPassword(password);
                } else {
                    await deletePassword();
                }
            }

            ctx.settingsStore = store;

            for (const account of settings.accounts) {
                await initAccountSessions(ctx, account);
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
            // update the config first (as the consequent actions require it to be updated)
            await ctx.configStoreQueue.q(async () => {
                await ctx.configStore.write({
                    ...await ctx.configStore.readExisting(),
                    encryptionPreset,
                });
            });

            const [result] = await Promise.all([
                // re-encrypt "settings.bin" file
                endpoints.changeMasterPassword({password, newPassword: password}),
                // re-encrypt "database & session storage" files
                (async () => {
                    for (const db of [ctx.db, ctx.sessionDb, ctx.sessionStorage] as const) {
                        if (await db.persisted()) {
                            await db.saveToFile();
                        }
                    }
                })(),
            ]);

            return result;
        },

        // TODO move to "src/electron-main/api/endpoints-builders/database"
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async loadDatabase({accounts}) {
            logger.info(nameof(endpoints.loadDatabase), "start");

            const config = await lastValueFrom(ctx.config$.pipe(first()));
            const needToSave = {sessionDb: false, db: false};
            let mergeId: string | undefined;

            // TODO move to "readSettings" method
            await ctx.sessionStorage.load(accounts.map(({login}) => login));

            // loading & upgrading
            for (const dbType of ["sessionDb", "db"] as const) {
                const db = ctx[dbType];
                if (!(await db.persisted())) continue;
                await db.loadFromFile();
                const upgraded = await upgradeDatabase(db, accounts);
                logger.verbose(nameof(endpoints.loadDatabase), `"${dbType}" upgraded:`, upgraded);
                if (upgraded) {
                    needToSave[dbType] = true;
                }
            }

            { // cleaning thins if some db savings got failed before (previous app runs)
                const sessionDbMergeId = ctx.sessionDb.mergeId;
                if (sessionDbMergeId) {
                    if (sessionDbMergeId === ctx.db.mergeId) {
                        // case: "primary db" got saved after merging but "session db" saving after "resetting" got failed
                        // action: just cleaning it up (re-applying resetting)
                        ctx.sessionDb.reset();
                        await ctx.sessionDb.saveToFile();
                    } else {
                        // case: "primary db" saving after merging got failed
                        // action: NOOP (new merging will happen next in the code)
                        noop(); // to please linting (TODO just ignore the linting rule)
                    }
                }
            }

            { // merging
                const shouldMerge = await ctx.sessionDb.persisted();
                const shouldSaveMerged = (
                    shouldMerge
                    &&
                    fs.statSync(ctx.sessionDb.options.file).size >= config.dbMergeBytesFileSizeThreshold
                );
                logger.verbose(nameof(endpoints.loadDatabase), JSON.stringify({shouldMerge, shouldSaveMerged}));
                if (shouldSaveMerged && !(await ctx.db.persisted())) { // primary db doesn't exist yet, so just renaming instead of merging
                    if (needToSave.sessionDb) await ctx.sessionDb.saveToFile();
                    await fs.promises.rename(ctx.sessionDb.options.file, ctx.db.options.file);
                    ctx.sessionDb.reset();
                    await ctx.sessionDb.saveToFile();
                    await ctx.db.loadFromFile();
                    needToSave.sessionDb = false;
                    needToSave.db = false;
                } else { // actual merging
                    if (shouldMerge) {
                        for (const {pk: accountPk} of ctx.sessionDb) {
                            if (
                                Database.mergeAccount(ctx.sessionDb, ctx.db, accountPk)
                                &&
                                shouldSaveMerged
                            ) {
                                needToSave.db = true;
                            }
                        }
                    }
                    if (shouldSaveMerged) {
                        needToSave.sessionDb = true;
                        mergeId = new UUID(4).format();
                        // WARN we mark the "session db" as "has to be reset" in the case its consequent "saving after reset" fails
                        //      so with this mark the app will reset it first thing to happen when it starts next time
                        await ctx.sessionDb.setMergeIdAndSaveToFile(mergeId);
                    }
                }
            }

            // WARN saving the "primary db" first as "session db" gets reset before saving if merged
            //      and so data loss might occur if "primary db" didn't get saved before "session db" saving
            if (needToSave.db) {
                if (mergeId) {
                    await ctx.db.setMergeIdAndSaveToFile(mergeId);
                } else {
                    await ctx.db.saveToFile();
                }
            }
            if (needToSave.sessionDb) {
                // WARN don't use "ctx.sessionDb.mergeId" test here as the value might potentially be filled in the previous app runs
                //       when: "saving after merge" got failed and so "mergeId" remains AND merge threshold size got change manually
                if (mergeId) {
                    ctx.sessionDb.reset();
                }
                await ctx.sessionDb.saveToFile();
            }

            if (config.fullTextSearch) {
                await attachFullTextIndexWindow(ctx);
            } else {
                await detachFullTextIndexWindow(ctx);
            }

            logger.info(nameof(endpoints.loadDatabase), "end");
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
