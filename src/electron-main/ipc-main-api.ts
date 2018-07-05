import aboutWindow from "about-window";
import assert from "assert";
import Jimp from "jimp";
import keytar from "keytar";
import {app, nativeImage, NativeImage, shell} from "electron";
import {EMPTY, from} from "rxjs";
import {isWebUri} from "valid-url";
import {KeePassHttpClient} from "keepasshttp-client";
import {promisify} from "util";

import {AccountConfig} from "_@shared/model/account";
import {BuildEnvironment} from "_@shared/model/common";
import {buildSettingsAdapter, handleKeePassRequestError, toggleBrowserWindow} from "./util";
import {Context} from "./model";
import {ElectronContextLocations} from "_@shared/model/electron";
import {Endpoints, IPC_MAIN_API} from "_@shared/api/main";
import {KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";
import {StatusCode, StatusCodeError} from "_@shared/model/error";
import {upgradeConfig, upgradeSettings} from "./storage-upgrade";

export const initEndpoints = async (ctx: Context): Promise<Endpoints> => {
    const endpoints: Endpoints = {
        addAccount: ({type, entryUrl, login, credentials, credentialsKeePass}) => from((async () => {
            const settings = await ctx.settingsStore.readExisting();
            const account = {
                type,
                entryUrl,
                login,
                credentials,
                credentialsKeePass,
            } as AccountConfig; // TODO ger rid of "TS as" casting

            settings.accounts.push(account);

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
        keePassRecordRequest: ({keePassClientConf, keePassRef, suppressErrors}) => from((async () => {
            const client = new KeePassHttpClient(keePassClientConf);
            let response;

            try {
                await client.testAssociate();
                response = await client.getLogins({url: keePassRef.url});
            } catch (error) {
                return handleKeePassRequestError(error, suppressErrors);
            }

            if (response.Entries) {
                for (const entry of response.Entries) {
                    if (entry && entry.Uuid === keePassRef.uuid) {
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
            aboutWindow({
                icon_path: ctx.locations.icon,
                package_json_dir: (process.env.NODE_ENV as BuildEnvironment) === "development" ? process.cwd() : ctx.locations.app,
                // TODO figure why ""about-window" doesn't automatically resolve properties like "bugs" or "description" from package.json
                // properties are fulled in package.json, both original and modified by "electron-builder"
                description: String(process.env.APP_ENV_PACKAGE_DESCRIPTION),
                bug_report_url: String(process.env.APP_ENV_PACKAGE_BUGS_URL),
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
            shell.openItem(ctx.locations.userData);
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
        // TODO update "readConfig" api method test (upgradeConfig)
        readConfig: () => from((async () => {
            const config = await ctx.configStore.read();

            if (config) {
                if (upgradeConfig(config)) {
                    return ctx.configStore.write(config);
                }
                return config;
            }

            return ctx.configStore.write(ctx.initialStores.config);
        })()),
        // TODO update "readSettings" api method test (upgradeSettings)
        readSettings: ({password, savePassword}) => from((async () => {
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

            if (savePassword) {
                await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, password);
            } else {
                await keytar.deletePassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
            }

            ctx.settingsStore = store;

            return settings;
        })()),
        // TODO update "readSettings" api method test (upgradeSettings)
        readSettingsAuto: () => from((async () => {
            const password = await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);

            if (!password) {
                return EMPTY.toPromise();
            }

            const adapter = await buildSettingsAdapter(ctx, password);
            const store = ctx.settingsStore.clone({adapter});

            try {
                const settings = await (async () => {
                    const entity = await store.readExisting();

                    if (upgradeSettings(entity)) {
                        return store.write(entity);
                    }

                    return entity;
                })();

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

            assert.ok(index > -1, `Account to remove has not been found (login: "${payload.login}")`);

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
        // TODO update "updateAccount" api method test (entryUrl, changed credentials structure)
        updateAccount: ({entryUrl, login, credentials, credentialsKeePass}) => from((async () => {
            const settings = await ctx.settingsStore.readExisting();
            const existingAccount = settings.accounts
                .filter(({login: existingLogin}) => login === existingLogin)
                .shift();

            if (!existingAccount) {
                throw new StatusCodeError(
                    `Account to update has not been found (login: "${login}")`,
                    StatusCode.NotFoundAccount,
                );
            }

            if (entryUrl) {
                existingAccount.entryUrl = entryUrl;
            }

            const {credentials: existingCredentials, credentialsKeePass: existingCredentialsKeePass} = existingAccount;

            if (credentials) {
                if ("password" in credentials) {
                    existingCredentials.password = credentials.password || undefined;
                }
                if ("twoFactorCode" in credentials) {
                    existingCredentials.twoFactorCode = credentials.twoFactorCode || undefined;
                }
            }

            if (credentialsKeePass) {
                if ("password" in credentialsKeePass) {
                    existingCredentialsKeePass.password = credentialsKeePass.password || undefined;
                }
                if ("twoFactorCode" in credentialsKeePass) {
                    existingCredentialsKeePass.twoFactorCode = credentialsKeePass.twoFactorCode || undefined;
                }
            }

            if (existingAccount.type === "protonmail") {
                if (credentials && "mailPassword" in credentials) {
                    existingAccount.credentials.mailPassword = credentials.mailPassword || undefined;
                }
                if (credentialsKeePass && "mailPassword" in credentialsKeePass) {
                    existingAccount.credentialsKeePass.mailPassword = credentialsKeePass.mailPassword || undefined;
                }
            }

            return await ctx.settingsStore.write(settings);
        })()),
        ...(await (async () => {
            const trayIconsService = await prepareTrayIcons(ctx.locations);
            const result: Pick<Endpoints, "updateOverlayIcon"> = {
                updateOverlayIcon: ({unread}) => from((async () => {
                    const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
                    const tray = ctx.uiContext && ctx.uiContext.tray;

                    if (!browserWindow || !tray) {
                        return EMPTY.toPromise();
                    }

                    const {main, buildOverlay} = trayIconsService;

                    if (unread > 0) {
                        const overlayJimp = buildOverlay(unread);
                        const overlayBuffer = await promisify(overlayJimp.getBuffer.bind(overlayJimp))(Jimp.MIME_PNG);
                        const overlayNative = nativeImage.createFromBuffer(overlayBuffer);
                        const overlaySize = {w: overlayJimp.bitmap.width, h: overlayJimp.bitmap.height};
                        const composedJimp = main.jimp.composite(overlayJimp, main.w - overlaySize.w, main.h - overlaySize.h);
                        const composedBuffer = await promisify(composedJimp.getBuffer.bind(composedJimp))(Jimp.MIME_PNG);
                        const composedNative = nativeImage.createFromBuffer(composedBuffer);

                        browserWindow.setOverlayIcon(overlayNative, `Unread messages count: ${unread}`);
                        tray.setImage(composedNative);
                        app.setBadgeCount(unread);
                    } else {
                        browserWindow.setOverlayIcon(null as any, "");
                        tray.setImage(main.native);
                        app.setBadgeCount(0);
                    }

                    return EMPTY.toPromise();
                })()),
            };

            return result;
        })()),
    };

    IPC_MAIN_API.registerApi(endpoints);

    return endpoints;
};

export async function prepareTrayIcons(locations: ElectronContextLocations): Promise<{
    main: { native: NativeImage, jimp: Jimp, w: number, h: number },
    buildOverlay: (unread: number) => Jimp,
}> {
    const main = await (async () => {
        const native = nativeImage.createFromPath(locations.trayIcon);
        const jimp = await Jimp.read(native.toPNG());

        return Object.freeze({
            native,
            jimp,
            w: jimp.bitmap.width,
            h: jimp.bitmap.height,
        });
    })();
    const buildOverlay = await (async () => {
        const factors = {overlay: .75, text: .9};
        const size = {w: Math.round(main.w * factors.overlay), h: Math.round(main.h * factors.overlay)};
        const imageSource = await Jimp.read(nativeImage.createFromPath(locations.trayIconOverlay).toPNG());
        const jimp = await promisify(imageSource.resize.bind(imageSource))(size.w, size.h);
        // TODO there is no "loadFont" function signature provided by Jimp's declaration file
        const font = await (Jimp as any).loadFont(Jimp.FONT_SANS_64_WHITE);
        const fontSize = 64;
        const printX = [
            30,
            8,
        ];
        const printY = size.h / 2 - (fontSize / 2);

        return (unread: number) => {
            const index = String(unread).length - 1;

            if (index < printX.length) {
                return jimp.clone().print(font, printX[index], printY, String(unread), size.w * factors.text);
            }

            return jimp;
        };
    })();

    return {
        main,
        buildOverlay,
    };
}
