import * as aboutWindow from "about-window";
import {isWebUri} from "valid-url";
import {promisify} from "util";
import {app, nativeImage, shell} from "electron";
import {KeePassHttpClient, Model as KeePassHttpClientModel} from "keepasshttp-client";
import * as keytar from "keytar";
import * as Jimp from "jimp";

import {ElectronIpcMainAction, IpcMainChannel} from "_shared/electron-actions/model";
import {StatusCode, StatusCodeError} from "_shared/model/error";
import {MessageFieldContainer} from "_shared/model/container";
import {IpcMainActions} from "_shared/electron-actions";
import {AccountConfig} from "_shared/model/account";
import {assert} from "_shared/util";
import {KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";
import {buildSettingsAdapter, ipcMainOn, toggleBrowserWindow} from "./util";
import {Context, EndpointsMap} from "./model";

export const initEndpoints = (ctx: Context): EndpointsMap => {
    const endpoints: EndpointsMap = Object.freeze({
        [IpcMainActions.Init.channel]: new ElectronIpcMainAction<IpcMainActions.Init.Type>(
            IpcMainActions.Init.channel,
            async () => {
                const password = await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);

                return {
                    electronLocations: ctx.locations,
                    hasSavedPassword: !!password,
                };
            },
        ),
        [IpcMainActions.ReadConfig.channel]: new ElectronIpcMainAction<IpcMainActions.ReadConfig.Type>(
            IpcMainActions.ReadConfig.channel,
            async () => (await ctx.configStore.read()) || ctx.configStore.write(ctx.initialStores.config),
        ),
        [IpcMainActions.ToggleCompactLayout.channel]: new ElectronIpcMainAction<IpcMainActions.ToggleCompactLayout.Type>(
            IpcMainActions.ToggleCompactLayout.channel,
            async () => {
                const config = await ctx.configStore.readExisting();

                return await ctx.configStore.write({...config, compactLayout: !config.compactLayout});
            },
        ),
        // TODO test "ReadSettingsAuto" action
        [IpcMainActions.ReadSettingsAuto.channel]: new ElectronIpcMainAction<IpcMainActions.ReadSettingsAuto.Type>(
            IpcMainActions.ReadSettingsAuto.channel,
            async () => {
                const password = await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);

                if (!password) {
                    return;
                }

                const adapter = await buildSettingsAdapter(ctx, password);
                const store = ctx.settingsStore.clone({adapter});

                try {
                    const settings = await store.readExisting();

                    ctx.settingsStore = store;

                    return settings;
                } catch {
                    // the following errors might happen and are being ignored:
                    // - file not found - settings file might be removed manually
                    // - decryption - saved password might be wrong
                    return;
                }
            },
        ),
        [IpcMainActions.ReadSettings.channel]: new ElectronIpcMainAction<IpcMainActions.ReadSettings.Type>(
            IpcMainActions.ReadSettings.channel,
            async ({password, savePassword}) => {
                const adapter = await buildSettingsAdapter(ctx, password);
                const store = ctx.settingsStore.clone({adapter});
                const settings = await store.readable()
                    ? await store.readExisting()
                    : await store.write(ctx.initialStores.settings);

                if (savePassword) {
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, password);
                } else {
                    await keytar.deletePassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
                }

                ctx.settingsStore = store;

                return settings;
            },
        ),
        // TODO test "ReEncryptSettings" API
        [IpcMainActions.ReEncryptSettings.channel]: new ElectronIpcMainAction<IpcMainActions.ReEncryptSettings.Type>(
            IpcMainActions.ReEncryptSettings.channel,
            async ({encryptionPreset, password}) => {
                await ctx.configStore.write({
                    ...(await ctx.configStore.readExisting()),
                    encryptionPreset,
                });

                return await endpoints[IpcMainActions.ChangeMasterPassword.channel].process({password, newPassword: password});
            },
        ),
        [IpcMainActions.SettingsExists.channel]: new ElectronIpcMainAction<IpcMainActions.SettingsExists.Type>(
            IpcMainActions.SettingsExists.channel,
            async () => ctx.settingsStore.readable(),
        ),
        [IpcMainActions.AddAccount.channel]: new ElectronIpcMainAction<IpcMainActions.AddAccount.Type>(
            IpcMainActions.AddAccount.channel,
            async ({login, passwordValue, mailPasswordValue, twoFactorCodeValue}) => {
                const settings = await ctx.settingsStore.readExisting();
                const account: AccountConfig = {
                    login,
                    credentials: {
                        password: {value: passwordValue || undefined},
                        mailPassword: {value: mailPasswordValue || undefined},
                        twoFactorCode: {value: twoFactorCodeValue || undefined},
                    },
                };

                settings.accounts.push(account);

                // TODO return created "AccountConfig" only, not the whole settings object
                return await ctx.settingsStore.write(settings);
            },
        ),
        [IpcMainActions.UpdateAccount.channel]: new ElectronIpcMainAction<IpcMainActions.UpdateAccount.Type>(
            IpcMainActions.UpdateAccount.channel,
            async (payload) => {
                const settings = await ctx.settingsStore.readExisting();
                const matchedAccount = settings.accounts
                    .filter(({login}) => login === payload.login)
                    .shift();

                if (!matchedAccount) {
                    throw new StatusCodeError(
                        `Account to update has not been found (login: "${payload.login}")`,
                        StatusCode.NotFoundAccount,
                    );
                }

                if ("passwordValue" in payload) {
                    matchedAccount.credentials.password.value = payload.passwordValue || undefined;
                }
                if ("twoFactorCodeValue" in payload) {
                    matchedAccount.credentials.twoFactorCode = {
                        value: payload.twoFactorCodeValue || undefined,
                    };
                }
                if ("mailPasswordValue" in payload) {
                    matchedAccount.credentials.mailPassword.value = payload.mailPasswordValue || undefined;
                }
                if ("mailPasswordKeePassRef" in payload) {
                    if (payload.mailPasswordKeePassRef) {
                        matchedAccount.credentials.mailPassword.keePassRef = payload.mailPasswordKeePassRef;
                    } else {
                        delete matchedAccount.credentials.mailPassword.keePassRef;
                    }
                }
                if ("passwordKeePassRef" in payload) {
                    if (payload.passwordKeePassRef) {
                        matchedAccount.credentials.password.keePassRef = payload.passwordKeePassRef;
                    } else {
                        delete matchedAccount.credentials.password.keePassRef;
                    }
                }

                // TODO return updated "AccountConfig" only, not the entire settings object
                return await ctx.settingsStore.write(settings);
            },
        ),
        [IpcMainActions.RemoveAccount.channel]: new ElectronIpcMainAction<IpcMainActions.RemoveAccount.Type>(
            IpcMainActions.RemoveAccount.channel,
            async (payload) => {
                const settings = await ctx.settingsStore.readExisting();
                const index = settings.accounts.findIndex(({login}) => login === payload.login);

                assert(index > -1, `Account to remove has not been found (login: "${payload.login}")`);

                settings.accounts.splice(index, 1);

                return ctx.settingsStore.write(settings);
            },
        ),
        [IpcMainActions.ChangeMasterPassword.channel]: new ElectronIpcMainAction<IpcMainActions.ChangeMasterPassword.Type>(
            IpcMainActions.ChangeMasterPassword.channel,
            async ({password, newPassword}) => {
                const readStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, password)});
                const existingData = await readStore.readExisting();
                const newStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, newPassword)});
                const newData = await newStore.write(existingData, {readAdapter: ctx.settingsStore.adapter});

                ctx.settingsStore = newStore;

                if (keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT)) {
                    await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, newPassword);
                }

                return newData;
            },
        ),
        [IpcMainActions.AssociateSettingsWithKeePass.channel]: new ElectronIpcMainAction<IpcMainActions.AssociateSettingsWithKeePass.Type>(
            IpcMainActions.AssociateSettingsWithKeePass.channel,
            async ({url}) => {
                const client = new KeePassHttpClient({url});

                try {
                    await client.associate();
                } catch (error) {
                    handleKeePassRequestError(error);
                }

                return ctx.settingsStore.write({
                    ...(await ctx.settingsStore.readExisting()),
                    keePassClientConf: {url: client.url, keyId: {id: client.id, key: client.key}},
                });
            },
        ),
        [IpcMainActions.KeePassRecordRequest.channel]: new ElectronIpcMainAction<IpcMainActions.KeePassRecordRequest.Type>(
            IpcMainActions.KeePassRecordRequest.channel,
            async (payload) => {
                let response;
                const client = new KeePassHttpClient(payload.keePassClientConf);

                try {
                    await client.testAssociate();
                    response = await client.getLogins({url: payload.keePassRef.url});
                } catch (error) {
                    return handleKeePassRequestError(error, payload.suppressErrors);
                }

                if (response.Entries) {
                    for (const entry of response.Entries) {
                        if (entry && entry.Uuid === payload.keePassRef.uuid) {
                            return {password: entry.Password};
                        }
                    }
                }

                return {message: `Password is not found`};
            },
        ),
        [IpcMainActions.Logout.channel]: new ElectronIpcMainAction<IpcMainActions.Logout.Type>(
            IpcMainActions.Logout.channel,
            async () => {
                await keytar.deletePassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
                ctx.settingsStore = ctx.settingsStore.clone({adapter: undefined});
            },
        ),
        [IpcMainActions.Quit.channel]: new ElectronIpcMainAction<IpcMainActions.Quit.Type>(
            IpcMainActions.Quit.channel,
            async () => {
                app.quit();
            },
        ),
        [IpcMainActions.ToggleBrowserWindow.channel]: new ElectronIpcMainAction<IpcMainActions.ToggleBrowserWindow.Type>(
            IpcMainActions.ToggleBrowserWindow.channel,
            async ({forcedState}) => {
                toggleBrowserWindow(ctx.uiContext, forcedState);
            },
        ),
        [IpcMainActions.OpenAboutWindow.channel]: new ElectronIpcMainAction<IpcMainActions.OpenAboutWindow.Type>(
            IpcMainActions.OpenAboutWindow.channel,
            async () => {
                aboutWindow.default({
                    icon_path: ctx.locations.icon,
                    package_json_dir: ctx.env === "development" ? process.cwd() : ctx.locations.app,
                    // TODO electron-builder strips "bugs" property out form the package.json preparing a build
                    bug_report_url: "https://github.com/vladimiry/protonmail-desktop-app/issues",
                });
            },
        ),
        [IpcMainActions.OpenExternal.channel]: new ElectronIpcMainAction<IpcMainActions.OpenExternal.Type>(
            IpcMainActions.OpenExternal.channel,
            async ({url}) => {
                if (!isWebUri(url)) {
                    throw new Error(`Forbidden url "${url}" opening has been prevented`);
                }

                await promisify(shell.openExternal)(url, {activate: true});
            },
        ),
        [IpcMainActions.OpenSettingsFolder.channel]: new ElectronIpcMainAction<IpcMainActions.OpenSettingsFolder.Type>(
            IpcMainActions.OpenSettingsFolder.channel,
            async () => {
                shell.openItem(ctx.locations.data);
            },
        ),
        [IpcMainActions.PatchBaseSettings.channel]: new ElectronIpcMainAction<IpcMainActions.PatchBaseSettings.Type>(
            IpcMainActions.PatchBaseSettings.channel,
            async (patch) => {
                const config = await ctx.configStore.readExisting();
                const actualPatch = JSON.parse(JSON.stringify(patch));

                return await ctx.configStore.write({...config, ...actualPatch});
            },
        ),
        // TODO test "UpdateOverlayIcon" action
        [IpcMainActions.UpdateOverlayIcon.channel]: new ElectronIpcMainAction<IpcMainActions.UpdateOverlayIcon.Type>(
            IpcMainActions.UpdateOverlayIcon.channel,
            (() => {
                const overlaySizeFactor = 0.6;
                let main: { native: Electron.NativeImage; jimp: Jimp; w: number; h: number; } | null = null;

                return async ({count, dataURL}: IpcMainActions.UpdateOverlayIcon.Type["i"]) => {
                    const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
                    const tray = ctx.uiContext && ctx.uiContext.tray;

                    if (!browserWindow || !tray) {
                        return;
                    }

                    if (!main) {
                        const native = nativeImage.createFromPath(ctx.locations.trayIcon);
                        const jimp = await Jimp.read(native.toPNG());

                        main = {native, jimp, w: jimp.bitmap.width, h: jimp.bitmap.height};
                    }

                    if (dataURL) {
                        const overlaySource = nativeImage.createFromDataURL(dataURL);
                        const overlaySourceJimp = await Jimp.read(overlaySource.toPNG());
                        const overlaySize = {w: Math.round(main.w * overlaySizeFactor), h: Math.round(main.h * overlaySizeFactor)};
                        const overlayJimp = await promisify(overlaySourceJimp.resize.bind(overlaySourceJimp))(overlaySize.w, overlaySize.h);
                        const overlayBuffer = await promisify(overlayJimp.getBuffer.bind(overlayJimp))(Jimp.MIME_PNG);
                        const overlayNative = nativeImage.createFromBuffer(overlayBuffer);
                        const composedJimp = main.jimp.composite(overlayJimp, main.w - overlaySize.w, main.h - overlaySize.h);
                        const composedBuffer = await promisify(composedJimp.getBuffer.bind(composedJimp))(Jimp.MIME_PNG);
                        const composedNative = nativeImage.createFromBuffer(composedBuffer);

                        browserWindow.setOverlayIcon(overlayNative, `Unread messages ${count}`);
                        tray.setImage(composedNative);
                        app.setBadgeCount(count);
                    } else {
                        browserWindow.setOverlayIcon(null as any, "");
                        tray.setImage(main.native);
                        app.setBadgeCount(0);
                    }
                };
            })(),
        ),
    });

    for (const channel of Object.keys(endpoints)) {
        ipcMainOn(endpoints[channel as IpcMainChannel]);
    }

    return endpoints;
};

export function handleKeePassRequestError(error: any, suppressErrors = false): MessageFieldContainer {
    if (error instanceof KeePassHttpClientModel.Common.NetworkResponseStatusCodeError && error.statusCode === 503) {
        if (suppressErrors) {
            return {message: "Locked"};
        }
        error.message = "KeePass: Locked";
    }
    if (error instanceof KeePassHttpClientModel.Common.NetworkConnectionError) {
        if (suppressErrors) {
            return {message: "No connection"};
        }
        error.message = "KeePass: No connection";
    }
    if (error instanceof KeePassHttpClientModel.Common.NetworkResponseContentError) {
        if (suppressErrors) {
            return {message: "Invalid response"};
        }
        error.message = "KeePass: Invalid response";
    }
    if (suppressErrors) {
        return {message: "Request failed"};
    }
    throw error;
}
