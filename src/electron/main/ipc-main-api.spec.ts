import * as path from "path";
import * as sinon from "sinon";
import * as logger from "electron-log";
import rewiremock from "rewiremock";
import {GenericTestContext, test} from "ava";
import {Fs} from "fs-json-store";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter/encryption-adapter";

import {assert, pickBaseConfigProperties} from "_shared/util";
import {Config, Settings} from "_shared/model/options";
import {IpcMainActions} from "_shared/electron-actions";
import {IpcMainChannel} from "_shared/electron-actions/model";
import {StatusCode, StatusCodeError} from "_shared/model/error";
import {AccountConfigPatch} from "_shared/model/container";
import {INITIAL_STORES, KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";
// @ts-ignore (prevent "'Context' is declared but its value is never read." error)
import {Context, EndpointsMap} from "./model";
import {buildSettingsAdapter, initContext} from "./util";

interface TestContext extends GenericTestContext<{
    context: {
        ctx: Context;
        endpoints: EndpointsMap;
        mocks: any;
        mocked: any;
    };
}> {}

const OPTIONS = Object.freeze({
    dataDirectory: path.join(
        process.cwd(),
        `protonmail-desktop-app.spec`,
        `${path.basename(__filename)}-${Number(new Date())}`,
    ),
    masterPassword: "masterPassword123",
});

test.serial("Initialization", async (t: TestContext) => {
    const ipcMainOnSpy: sinon.SinonSpy = t.context.mocks["./util"].ipcMainOn;

    const endpoints = t.context.endpoints;
    const channels = [];

    // tslint:disable:forin
    for (const channel in IpcMainChannel) {
        channels.push(IpcMainChannel[channel]);
    }
    // tslint:enable:forin
    channels.sort();

    const endpointsChannels = Object.keys(endpoints);
    endpointsChannels.sort();

    t.deepEqual(
        endpointsChannels,
        channels,
        "all channels should have respective endpoints initialized",
    );

    t.is(
        endpointsChannels.reduce((sum, channel) => sum + Number(ipcMainOnSpy.calledWithExactly(endpoints[channel as IpcMainChannel])), 0),
        endpointsChannels.length,
        `subscribe(): "ipcMainOn" has been called for all the ${endpointsChannels.length} endpoints"`,
    );
});

test.serial(`API: ${IpcMainActions.Init.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;
    const endpoint = endpoints[IpcMainActions.Init.channel];
    const result = await endpoint.process(undefined);

    t.deepEqual(result.electronLocations, t.context.ctx.locations);
    t.is(typeof result.hasSavedPassword, "boolean");
});

test.serial(`API: ${IpcMainActions.ReadConfig.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;

    t.false(await t.context.ctx.configStore.readable(), "config file does not exist");
    const initial = await initConfig(endpoints);
    const initialExpected = {...t.context.ctx.initialStores.config, ...{_rev: 0}};
    t.deepEqual(initial, initialExpected, "checking initial config file");
    t.true(await t.context.ctx.configStore.readable(), "config file exists");
});

test.serial(`API: ${IpcMainActions.ToggleCompactLayout.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.ToggleCompactLayout.channel];

    const initial = await initConfig(endpoints);
    t.true(!initial.compactLayout);

    let updated = await action.process(undefined);
    t.is(updated.compactLayout, true);

    await action.process(undefined);
    updated = await t.context.ctx.configStore.readExisting();
    t.is(updated.compactLayout, false);
});

test.serial(`API: ${IpcMainActions.SettingsExists.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;

    t.false(await t.context.ctx.settingsStore.readable(), "store: settings file does not exist");
    await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});
    t.true(await t.context.ctx.settingsStore.readable(), "store: settings file exists");
});

test.serial(`API: ${IpcMainActions.ReadSettings.channel}`, async (t: TestContext) => {
    const setPasswordSpy = t.context.mocks.keytar.setPassword;
    const deletePasswordSpy = t.context.mocks.keytar.deletePassword;
    const endpoints = t.context.endpoints;

    t.false(await t.context.ctx.settingsStore.readable(), "settings file does not exist");
    t.falsy(t.context.ctx.settingsStore.adapter, "adapter is not set");
    const initial = await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});
    t.is(t.context.ctx.settingsStore.adapter && t.context.ctx.settingsStore.adapter.constructor.name,
        EncryptionAdapter.name,
        "adapter is an EncryptionAdapter",
    );
    const initialExpected = {...t.context.ctx.initialStores.settings, ...{_rev: 0}};
    t.deepEqual(initial, initialExpected, "checking initial settings file");
    t.true(await t.context.ctx.settingsStore.readable(), "settings file exists");
    t.is(setPasswordSpy.callCount, 0);
    t.is(deletePasswordSpy.callCount, 1);
    t.true(deletePasswordSpy.alwaysCalledWithExactly(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT));

    const initialUpdated = await t.context.ctx.settingsStore.write(initial);
    const initialUpdatedExpected = {...initial, ...initialExpected, ...{_rev: initialExpected._rev + 1}};
    t.deepEqual(initialUpdated, initialUpdatedExpected, "saved initial settings file");
    t.deepEqual(await t.context.ctx.settingsStore.read(), initialUpdatedExpected, "loaded initial settings file");

    await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword, savePassword: true});
    t.is(setPasswordSpy.callCount, 1);
    setPasswordSpy.calledWithExactly(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, OPTIONS.masterPassword);
});

test.serial(`API: ${IpcMainActions.AddAccount.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;
    const addHandler = endpoints[IpcMainActions.AddAccount.channel];
    const payload = Object.freeze({
        login: "login1",
        passwordValue: "password1",
        mailPasswordValue: "mailPassword1",
        twoFactorCodeValue: "twoFactorCodeValue1",
    });

    const settings = await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

    t.is(settings.accounts.length, 0, `accounts list is empty`);

    const updatedSettings = await addHandler.process(payload);
    const expectedSettings = {
        ...settings,
        _rev: (settings._rev as number) + 1,
        accounts: [
            ...settings.accounts,
            {
                login: payload.login,
                credentials: {
                    password: {value: payload.passwordValue},
                    mailPassword: {value: payload.mailPasswordValue},
                    twoFactorCode: {value: payload.twoFactorCodeValue},
                },
            },
        ],
    };

    t.is(updatedSettings.accounts.length, 1, `1 account`);
    t.deepEqual(updatedSettings, expectedSettings, `settings with added account is returned`);
    t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `settings with added account is persisted`);

    try {
        await addHandler.process(payload);
    } catch ({message}) {
        const messageEnd = `Duplicate accounts identified. Duplicated logins: ${payload.login}.`;
        t.is(messageEnd, message.substr(message.indexOf(messageEnd)), "Account.login unique constraint");
    }

    const payload2 = {...payload, ...{login: "login2"}};
    const updatedSettings2 = await addHandler.process(payload2);
    const expectedSettings2 = {
        ...updatedSettings,
        _rev: (updatedSettings._rev as number) + 1,
        accounts: [
            ...updatedSettings.accounts,
            {...updatedSettings.accounts[0], ...{login: payload2.login}},
        ],
    };

    t.is(updatedSettings2.accounts.length, 2, `2 accounts`);
    t.deepEqual(updatedSettings2, expectedSettings2, `settings with added account is returned`);
    t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings2, `settings with added account is persisted`);
});

test.serial(`API: ${IpcMainActions.UpdateAccount.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;
    const addHandler = endpoints[IpcMainActions.AddAccount.channel];
    const updateHandler = endpoints[IpcMainActions.UpdateAccount.channel];
    const payload = {login: "login345", password: "password1", mailPassword: "mailPassword1", twoFactorCode: "2fa1"};
    const updatePatch: AccountConfigPatch = {login: "login345", passwordValue: "password2", twoFactorCodeValue: "2fa2"};

    await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

    try {
        await updateHandler.process(payload);
    } catch (err) {
        t.is(err.constructor.name, StatusCodeError.name, "StatusCodeError constructor");
        t.is(err.statusCode, StatusCode.NotFoundAccount, "StatusCode.NotFoundAccount");
    }

    const settings = await addHandler.process(payload);
    const updatedSettings = await updateHandler.process(updatePatch);
    const expectedSettings = {
        ...settings,
        _rev: (settings._rev as number) + 1,
        accounts: [{
            ...settings.accounts[0],
            ...{
                credentials: {
                    ...settings.accounts[0].credentials,
                    ...{
                        password: {
                            value: updatePatch.passwordValue,
                        },
                        twoFactorCode: {
                            value: updatePatch.twoFactorCodeValue,
                        },
                    },
                },
            },
        }],
    };

    t.is(updatedSettings.accounts.length, 1, `1 account`);
    t.deepEqual(updatedSettings, expectedSettings, `settings with updated account is returned`);
    t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `settings with updated account is persisted`);
});

test.serial(`API: ${IpcMainActions.RemoveAccount.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;
    const addHandler = endpoints[IpcMainActions.AddAccount.channel];
    const removeHandler = endpoints[IpcMainActions.RemoveAccount.channel];
    const addPayload1 = {login: "login1", passwordValue: "password1", mailPasswordValue: "mailPassword1", twoFactorCodeValue: "2fa1"};
    const addPayload2 = {login: "login2", passwordValue: "password2", mailPasswordValue: "mailPassword2", twoFactorCodeValue: "2fa2"};
    const removePayload = {login: addPayload1.login};
    const removePayload404 = {login: "404 login"};

    await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

    try {
        await removeHandler.process(removePayload404);
    } catch ({message}) {
        t.is(message, `Account to remove has not been found (login: "${removePayload404.login}")`, "404 account");
    }

    await addHandler.process(addPayload1);
    await addHandler.process(addPayload2);
    const settings = await t.context.ctx.settingsStore.readExisting();
    const updatedSettings = await removeHandler.process(removePayload);
    const expectedSettings = {
        ...settings,
        _rev: (settings._rev as number) + 1,
        accounts: [{
            login: addPayload2.login,
            credentials: {
                password: {value: addPayload2.passwordValue},
                mailPassword: {value: addPayload2.mailPasswordValue},
                twoFactorCode: {value: addPayload2.twoFactorCodeValue},
            },
        }],
    };

    t.is(updatedSettings.accounts.length, 1, `1 account`);
    t.deepEqual(updatedSettings, expectedSettings, `settings with updated account is returned`);
    t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `settings with updated account is persisted`);
});

test.serial(`API: ${IpcMainActions.ChangeMasterPassword.channel}`, async (t: TestContext) => {
    const getPasswordStub = t.context.mocks.keytar.getPassword;
    const setPasswordSpy = t.context.mocks.keytar.setPassword;

    const endpoints = t.context.endpoints;
    const endpoint = endpoints[IpcMainActions.ChangeMasterPassword.channel];
    const payload = {password: OPTIONS.masterPassword, newPassword: "new password 1"};
    const emptyPasswordPayload = {password: "", newPassword: "new password 2"};
    const wrongPasswordPayload = {password: "wrong password", newPassword: "new password 3"};

    const settings = await initConfigAndSettings(endpoints, {password: payload.password});

    await t.throws(endpoint.process(emptyPasswordPayload), /Decryption\sfailed/gi);
    await t.throws(endpoint.process(wrongPasswordPayload), /Decryption\sfailed/gi);

    const updatedSettingsAdapter = t.context.ctx.settingsStore.adapter; // keep reference before update
    const updatedSettingsStore = t.context.ctx.settingsStore; // keep reference before update
    const updatedSettings = await endpoint.process(payload);
    const expectedSettings = {
        ...settings,
        _rev: (settings._rev as number) + 1,
    };
    const expectedAdapter = await buildSettingsAdapter(t.context.ctx, payload.newPassword);
    t.truthy(t.context.ctx.settingsStore, `store is defined`);
    t.not(t.context.ctx.settingsStore, updatedSettingsStore, `new store reference`);
    t.not(t.context.ctx.settingsStore.adapter, updatedSettingsAdapter, `new store.adapter reference`);
    t.deepEqual(t.context.ctx.settingsStore.adapter, expectedAdapter, `adapter should have a new password`);
    t.deepEqual(updatedSettings, expectedSettings, `re-saved settings is returned`);
    t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `re-saved settings is persisted`);
    const newStore = t.context.ctx.settingsStore.clone(
        {adapter: await buildSettingsAdapter(t.context.ctx, payload.newPassword)},
    );
    t.deepEqual(await newStore.read(), expectedSettings, `reading re-saved settings with new password`);

    t.is(getPasswordStub.callCount, 1);
    getPasswordStub.calledWithExactly(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT);
    t.is(setPasswordSpy.callCount, 1);
    setPasswordSpy.calledWithExactly(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT, payload.newPassword);
});

test.serial(`API: ${IpcMainActions.Logout.channel}`, async (t: TestContext) => {
    const deletePasswordSpy = t.context.mocks.keytar.deletePassword;
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.Logout.channel];

    await action.process(undefined);
    t.falsy(t.context.ctx.settingsStore.adapter);
    t.is(deletePasswordSpy.callCount, 1);

    await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});
    t.truthy(t.context.ctx.settingsStore.adapter);
    t.is(deletePasswordSpy.callCount, 2);

    await action.process(undefined);
    t.falsy(t.context.ctx.settingsStore.adapter);
    t.is(deletePasswordSpy.callCount, 3);

    // t.true(deletePasswordSpy.alwaysCalledWithExactly(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT));
});

test.serial(`API: ${IpcMainActions.Quit.channel}`, async (t: TestContext) => {
    const appQuitSpy: sinon.SinonSpy = t.context.mocks.electron.app.exit;
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.Quit.channel];

    await action.process(undefined);
    t.is(appQuitSpy.callCount, 1, "electron.app.exit called once");
});

test.serial(`API: ${IpcMainActions.ToggleBrowserWindow.channel}`, async (t: TestContext) => {
    const toggleBrowserWindowSpy: sinon.SinonSpy = t.context.mocks["./util"].toggleBrowserWindow;
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.ToggleBrowserWindow.channel];
    const payloads = [
        {forcedState: undefined},
        {forcedState: true},
        {forcedState: false},
    ];
    payloads.forEach((payload) => {
        action.process(payload);
        t.true(toggleBrowserWindowSpy.calledWithExactly(t.context.ctx, payload.forcedState));
    });
});

test.serial(`API: ${IpcMainActions.OpenAboutWindow.channel}`, async (t: TestContext) => {
    const defaultOnSpy: sinon.SinonSpy = t.context.mocks["about-window"].default;
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.OpenAboutWindow.channel];

    await action.process(undefined);
    const args = defaultOnSpy.getCall(0).args[0];
    t.true(args.icon_path.endsWith(path.normalize("assets/icons/icon.png")), "about called with proper icon path");
});

test.serial(`API: ${IpcMainActions.OpenExternal.channel}`, async (t: TestContext) => {
    const openExternalSpy: sinon.SinonSpy = t.context.mocks.electron.shell.openExternalSpy;
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.OpenExternal.channel];

    const forbiddenUrls = [
        "file://some/file",
        "/some/path",
        "",
        undefined,
        null,
    ];
    for (const url of forbiddenUrls) {
        await t.throws(action.process({url: String(url)}), `Forbidden url "${url}" opening has been prevented`);
    }

    const allowedUrls = [
        "https://mail.protonmail.com",
        "https://mail.protonmail.com/page",
        "https://protonmail.com",
        "https://protonmail.com/page",
        "https://somedomain.com/",
        "https://somedomain.com/page",
    ];
    for (const url of allowedUrls) {
        await t.notThrows(action.process({url}));
        t.true(openExternalSpy.calledWith(url), `electron.shell.openExternal.calledWith("${url}")`);
    }
});

test.serial(`API: ${IpcMainActions.OpenSettingsFolder.channel}`, async (t: TestContext) => {
    const openItemSpy: sinon.SinonSpy = t.context.mocks.electron.shell.openItem;
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.OpenSettingsFolder.channel];

    await action.process(undefined);

    t.true(openItemSpy.alwaysCalledWith(t.context.ctx.locations.data));
});

test.serial(`API: ${IpcMainActions.PatchBaseSettings.channel}`, async (t: TestContext) => {
    const endpoints = t.context.endpoints;
    const action = endpoints[IpcMainActions.PatchBaseSettings.channel];
    const patches = [
        {
            startMinimized: false,
            compactLayout: true,
            closeToTray: false,
            unreadNotifications: true,
            checkForUpdatesAndNotify: true,
        },
        {
            startMinimized: true,
            compactLayout: undefined,
            closeToTray: true,
            unreadNotifications: false,
            checkForUpdatesAndNotify: false,
        },
    ];

    await initConfig(endpoints);

    for (const patch of patches) {
        const initialConfig = await t.context.ctx.configStore.readExisting();
        const updatedConfig = await action.process(patch);
        const actual = pickBaseConfigProperties(updatedConfig);
        const expected = pickBaseConfigProperties({...initialConfig, ...JSON.parse(JSON.stringify(patch))});

        t.deepEqual(actual, expected);
        t.deepEqual(await t.context.ctx.configStore.readExisting(), updatedConfig);
    }
});

async function initConfig(endpoints: EndpointsMap): Promise<Config> {
    return await endpoints[IpcMainActions.ReadConfig.channel].process(undefined);
}

async function initConfigAndSettings(endpoints: EndpointsMap, payload: IpcMainActions.ReadSettings.Type["i"]): Promise<Settings> {
    await initConfig(endpoints);
    return await endpoints[IpcMainActions.ReadSettings.channel].process(payload);
}

test.beforeEach(async (t: TestContext) => {
    await (async () => {
        const openExternalSpy = sinon.spy();

        t.context.mocks = {
            "./util": {
                ipcMainOn: sinon.spy(),
                toggleBrowserWindow: sinon.spy(),
                buildSettingsAdapter,
            },
            "about-window": {
                default: sinon.spy(),
            },
            "electron": {
                app: {
                    exit: sinon.spy(),
                },
                remote: {
                    BrowserWindow: sinon.spy(),
                },
                ipcMain: {
                    on: sinon.spy(),
                },
                shell: {
                    openExternalSpy,
                    openExternal: (url: string, options?: Electron.OpenExternalOptions, callback?: (error: Error) => void): boolean => {
                        openExternalSpy(url);
                        if (callback) {
                            callback(null as any);
                        }
                        return true;
                    },
                    openItem: sinon.spy(),
                },
            },
            "keytar": {
                _rewiremock_no_callThrough: true,
                getPassword: sinon.stub().returns(OPTIONS.masterPassword),
                deletePassword: sinon.spy(),
                setPassword: sinon.spy(),
            },
        };

        t.context.mocked = {
            "./ipc-main-api": await rewiremock.around(
                () => import("./ipc-main-api"),
                (mock) => {
                    for (const key of Object.keys(t.context.mocks)) {
                        const mocks = t.context.mocks[key];
                        let mocked: any = mock(key);

                        if (!mocks._rewiremock_no_callThrough) {
                            mocked = mocked.callThrough();
                        }

                        mocked.with(mocks);
                    }
                },
            ),
        };
    })();

    const testName = assert(t.title);
    const directory = path.join(
        OPTIONS.dataDirectory,
        `${testName.replace(/[^A-Za-z0-9]/g, "_")}`,
    );
    const initialStores = {...INITIAL_STORES};
    const encryptionPreset = initialStores.config.encryptionPreset;
    const memFsVolume = Fs.MemFs.volume();

    memFsVolume.impl.mkdirpSync(process.cwd());

    // reducing work factor in order to speed-up the test process and make it less computing resources consuming
    encryptionPreset.keyDerivation = {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"};
    encryptionPreset.encryption = {type: "crypto", preset: "algorithm:aes-256-cbc"};

    logger.transports.file = ((msg: any) => {
        logger.transports.console(msg);
    }) as any;

    const ctx = await initContext({
        paths: {
            userData: directory,
            app: directory,
        },
        storeFs: memFsVolume,
        initialStores,
    });

    t.true(ctx.configStore.optimisticLocking);
    t.true(ctx.settingsStore.optimisticLocking);
    t.falsy(ctx.settingsStore.adapter);
    t.truthy(ctx.settingsStore.validators && ctx.settingsStore.validators.length);

    t.context.ctx = ctx;
    t.context.endpoints = t.context.mocked["./ipc-main-api"].initEndpoints(t.context.ctx);
});
