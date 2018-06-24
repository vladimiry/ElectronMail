import * as aboutWindow from "about-window";
import * as Jimp from "jimp";
import * as keytar from "keytar";
import {app, nativeImage, shell} from "electron";
import {EMPTY, from} from "rxjs";
import {isWebUri} from "valid-url";
import {KeePassHttpClient} from "keepasshttp-client";
import {promisify} from "util";

import {AccountConfig} from "_shared/model/account";
import {assert} from "_shared/util";
import {buildSettingsAdapter, handleKeePassRequestError, toggleBrowserWindow} from "./util";
import {Context} from "./model";
import {Endpoints, IPC_MAIN_API} from "_shared/api/main";
import {KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";
import {StatusCode, StatusCodeError} from "_shared/model/error";

export const initEndpoints = (ctx: Context): Endpoints => {
    const endpoints: Endpoints = {
        addAccount: ({login, passwordValue, mailPasswordValue, twoFactorCodeValue}) => from((async () => {
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
        })()),
        associateSettingsWithKeePass: ({url}) => from((async () => {
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
        })()),
        changeMasterPassword: ({password, newPassword}) => from((async () => {
            const readStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, password)});
            const existingData = await readStore.readExisting();
            const newStore = ctx.settingsStore.clone({adapter: await buildSettingsAdapter(ctx, newPassword)});
            const newData = await newStore.write(existingData, {readAdapter: ctx.settingsStore.adapter});

            ctx.settingsStore = newStore;

            if (await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT)) {
                await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, newPassword);
            }

            return newData;
        })()),
        init: () => from((async () => {
            const password = await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);

            return {
                electronLocations: ctx.locations,
                hasSavedPassword: !!password,
            };
        })()),
        keePassRecordRequest: (payload) => from((async () => {
            const client = new KeePassHttpClient(payload.keePassClientConf);
            let response;

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
        })()),
        logout: () => from((async () => {
            await keytar.deletePassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
            ctx.settingsStore = ctx.settingsStore.clone({adapter: undefined});
            return EMPTY.toPromise();
        })()),
        openAboutWindow: () => {
            aboutWindow.default({
                icon_path: ctx.locations.icon,
                package_json_dir: ctx.env === "development" ? process.cwd() : ctx.locations.app,
                // TODO electron-builder strips "bugs" property out form the package.json preparing a build
                bug_report_url: "https://github.com/vladimiry/protonmail-desktop-app/issues",
            });
            return EMPTY;
        },
        openExternal: ({url}) => from((async () => {
            if (!isWebUri(url)) {
                throw new Error(`Forbidden url "${url}" opening has been prevented`);
            }

            await promisify(shell.openExternal)(url, {activate: true});

            return EMPTY.toPromise();
        })()),
        openSettingsFolder: () => {
            shell.openItem(ctx.locations.data);
            return EMPTY;
        },
        patchBaseSettings: (patch) => from((async () => {
            const config = await ctx.configStore.readExisting();
            const actualPatch = JSON.parse(JSON.stringify(patch));

            return await ctx.configStore.write({...config, ...actualPatch});
        })()),
        quit: () => {
            app.exit();
            return EMPTY;
        },
        readConfig: () => from((async () => {
            return (await ctx.configStore.read()) || ctx.configStore.write(ctx.initialStores.config);
        })()),
        readSettings: ({password, savePassword}) => from((async () => {
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
        })()),
        readSettingsAuto: () => from((async () => {
            const password = await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);

            if (!password) {
                return EMPTY.toPromise();
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
                return EMPTY.toPromise();
            }
        })()),
        reEncryptSettings: ({encryptionPreset, password}) => from((async () => {
            await ctx.configStore.write({
                ...(await ctx.configStore.readExisting()),
                encryptionPreset,
            });
            return await endpoints.changeMasterPassword({password, newPassword: password}).toPromise();
        })()),
        removeAccount: (payload) => from((async () => {
            const settings = await ctx.settingsStore.readExisting();
            const index = settings.accounts.findIndex(({login}) => login === payload.login);

            assert(index > -1, `Account to remove has not been found (login: "${payload.login}")`);

            settings.accounts.splice(index, 1);

            return await ctx.settingsStore.write(settings);
        })()),
        settingsExists: () => from(ctx.settingsStore.readable()),
        toggleBrowserWindow: ({forcedState}) => {
            toggleBrowserWindow(ctx, forcedState);
            return EMPTY;
        },
        toggleCompactLayout: () => from((async () => {
            const config = await ctx.configStore.readExisting();
            return await ctx.configStore.write({...config, compactLayout: !config.compactLayout});
        })()),
        updateAccount: (payload) => from((async () => {
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
        })()),
        updateOverlayIcon: ({count, dataURL}) => from((async () => {
            const overlaySizeFactor = 0.6;
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            const tray = ctx.uiContext && ctx.uiContext.tray;

            if (!browserWindow || !tray) {
                return EMPTY.toPromise();
            }

            // TODO cache "main"
            const native = nativeImage.createFromPath(ctx.locations.trayIcon);
            const jimp = await Jimp.read(native.toPNG());
            const main: { native: Electron.NativeImage; jimp: Jimp; w: number; h: number; } = {
                native,
                jimp,
                w: jimp.bitmap.width,
                h: jimp.bitmap.height,
            };

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

            return EMPTY.toPromise();
        })()),
    };

    IPC_MAIN_API.registerApi(endpoints);

    return endpoints;
};
