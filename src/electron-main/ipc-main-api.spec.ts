import logger from "electron-log";
import path from "path";
import sinon from "sinon";
import anyTest, {ExecutionContext, ImplementationResult, TestInterface} from "ava";
import rewiremock from "rewiremock";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter/encryption-adapter";
import {Fs} from "fs-json-store";

import {AccountConfigPatch, PasswordFieldContainer} from "_@shared/model/container";
import {assert, pickBaseConfigProperties} from "_@shared/util";
import {BaseConfig, Config, Settings} from "_@shared/model/options";
import {buildSettingsAdapter, initContext} from "./util";
import {Context} from "./model";
import {Endpoints} from "_@shared/api/main";
import {INITIAL_STORES, KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";
import {StatusCode, StatusCodeError} from "_@shared/model/error";

interface TestContext {
    ctx: Context;
    endpoints: Endpoints;
    mocks: any;
    mocked: any;
}

const test = anyTest as TestInterface<TestContext>;

const OPTIONS = Object.freeze({
    dataDirectory: path.join(
        process.cwd(),
        `protonmail-desktop-app.spec`,
        `${path.basename(__filename)}-${Number(new Date())}`,
    ),
    masterPassword: "masterPassword123",
});

const tests: Record<keyof Endpoints, (t: ExecutionContext<TestContext>) => ImplementationResult> = {
    addAccount: async (t) => {
        const endpoints = t.context.endpoints;
        const addHandler = endpoints.addAccount;
        const payload = Object.freeze({
            login: "login1",
            passwordValue: "password1",
            mailPasswordValue: "mailPassword1",
            twoFactorCodeValue: "twoFactorCodeValue1",
        });

        const settings = await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        t.is(settings.accounts.length, 0, `accounts list is empty`);

        const updatedSettings = await addHandler(payload).toPromise();
        const expectedSettings: any = {
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
            await addHandler(payload).toPromise();
        } catch ({message}) {
            const messageEnd = `Duplicate accounts identified. Duplicated logins: ${payload.login}.`;
            t.is(messageEnd, message.substr(message.indexOf(messageEnd)), "Account.login unique constraint");
        }

        const payload2 = {...payload, ...{login: "login2"}};
        const updatedSettings2 = await addHandler(payload2).toPromise();
        const expectedSettings2: any = {
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
    },
    associateSettingsWithKeePass: async (t) => {
        // TODO test "associateSettingsWithKeePass" API
        t.pass();
    },
    changeMasterPassword: async (t) => {
        const getPasswordStub = t.context.mocks.keytar.getPassword;
        const setPasswordSpy = t.context.mocks.keytar.setPassword;

        const endpoints = t.context.endpoints;
        const endpoint = endpoints.changeMasterPassword;
        const payload = {password: OPTIONS.masterPassword, newPassword: "new password 1"};
        const emptyPasswordPayload = {password: "", newPassword: "new password 2"};
        const wrongPasswordPayload = {password: "wrong password", newPassword: "new password 3"};

        const settings = await initConfigAndSettings(endpoints, {password: payload.password});

        await t.throws(endpoint(emptyPasswordPayload).toPromise(), /Decryption\sfailed/gi);
        await t.throws(endpoint(wrongPasswordPayload).toPromise(), /Decryption\sfailed/gi);

        const updatedSettingsAdapter = t.context.ctx.settingsStore.adapter; // keep reference before update
        const updatedSettingsStore = t.context.ctx.settingsStore; // keep reference before update
        const updatedSettings = await endpoint(payload).toPromise();
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
    },
    init: async (t) => {
        const result = await t.context.endpoints.init().toPromise();

        t.deepEqual(result.electronLocations, t.context.ctx.locations);
        t.is(typeof result.hasSavedPassword, "boolean");
    },
    keePassRecordRequest: async (t) => {
        // TODO test "keePassRecordRequest" API
        t.pass();
    },
    logout: async (t) => {
        const deletePasswordSpy = t.context.mocks.keytar.deletePassword;
        const endpoints = t.context.endpoints;
        const action = endpoints.logout;

        await action().toPromise();
        t.falsy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 1);

        await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});
        t.truthy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 2);

        await action().toPromise();
        t.falsy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 3);

        // t.true(deletePasswordSpy.alwaysCalledWithExactly(KEYTAR_SERVICE_NAME, KEYTAR_MASTER_PASSWORD_ACCOUNT));
    },
    openAboutWindow: async (t) => {
        const defaultOnSpy: sinon.SinonSpy = t.context.mocks["about-window"].default;
        const action = t.context.endpoints.openAboutWindow;

        await action().toPromise();
        const args = defaultOnSpy.getCall(0).args[0];
        t.true(args.icon_path.endsWith(path.normalize("assets/icons/icon.png")), "about called with proper icon path");
    },
    openExternal: async (t) => {
        const openExternalSpy: sinon.SinonSpy = t.context.mocks.electron.shell.openExternalSpy;
        const action = t.context.endpoints.openExternal;

        const forbiddenUrls = [
            "file://some/file",
            "/some/path",
            "",
            undefined,
            null,
        ];
        for (const url of forbiddenUrls) {
            await t.throws(action({url: String(url)}).toPromise(), `Forbidden url "${url}" opening has been prevented`);
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
            // tslint:disable-next-line:await-promise
            await t.notThrows(action({url: url as string}).toPromise());
            t.true(openExternalSpy.calledWith(url), `electron.shell.openExternal.calledWith("${url}")`);
        }
    },
    openSettingsFolder: async (t) => {
        const openItemSpy: sinon.SinonSpy = t.context.mocks.electron.shell.openItem;
        await t.context.endpoints.openSettingsFolder().toPromise();
        t.true(openItemSpy.alwaysCalledWith(t.context.ctx.locations.userData));
    },
    patchBaseSettings: async (t) => {
        const endpoints = t.context.endpoints;
        const action = endpoints.patchBaseSettings;
        const patches: BaseConfig[] = [
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
            const updatedConfig = await action(patch as BaseConfig).toPromise();
            const actual = pickBaseConfigProperties(updatedConfig);
            const expected = pickBaseConfigProperties({...initialConfig, ...JSON.parse(JSON.stringify(patch))});

            t.deepEqual(actual, expected);
            t.deepEqual(await t.context.ctx.configStore.readExisting(), updatedConfig);
        }
    },
    quit: async (t) => {
        await t.context.endpoints.quit().toPromise();
        t.is(t.context.mocks.electron.app.exit.callCount, 1, "electron.app.exit called once");
    },
    readConfig: async (t) => {
        t.false(await t.context.ctx.configStore.readable(), "config file does not exist");
        const initial = await initConfig(t.context.endpoints);
        const initialExpected = {...t.context.ctx.initialStores.config, ...{_rev: 0}};
        t.deepEqual(initial, initialExpected, "checking initial config file");
        t.true(await t.context.ctx.configStore.readable(), "config file exists");
    },
    readSettings: async (t) => {
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
    },
    readSettingsAuto: async (t) => {
        // TODO test "readSettingsAuto" API
        t.pass();
    },
    reEncryptSettings: async (t) => {
        // TODO test "reEncryptSettings" API
        t.pass();
    },
    removeAccount: async (t) => {
        const endpoints = t.context.endpoints;
        const addHandler = endpoints.addAccount;
        const removeHandler = endpoints.removeAccount;
        const addPayload1 = {login: "login1", passwordValue: "password1", mailPasswordValue: "mailPassword1", twoFactorCodeValue: "2fa1"};
        const addPayload2 = {login: "login2", passwordValue: "password2", mailPasswordValue: "mailPassword2", twoFactorCodeValue: "2fa2"};
        const removePayload = {login: addPayload1.login};
        const removePayload404 = {login: "404 login"};

        await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        try {
            await removeHandler(removePayload404).toPromise();
        } catch ({message}) {
            t.is(message, `Account to remove has not been found (login: "${removePayload404.login}")`, "404 account");
        }

        await addHandler(addPayload1).toPromise();
        await addHandler(addPayload2).toPromise();
        const settings = await t.context.ctx.settingsStore.readExisting();
        const updatedSettings = await removeHandler(removePayload).toPromise();
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
    },
    settingsExists: async (t) => {
        t.false(await t.context.ctx.settingsStore.readable(), "store: settings file does not exist");
        await initConfigAndSettings(t.context.endpoints, {password: OPTIONS.masterPassword});
        t.true(await t.context.ctx.settingsStore.readable(), "store: settings file exists");
    },
    toggleBrowserWindow: async (t) => {
        const toggleBrowserWindowSpy: sinon.SinonSpy = t.context.mocks["./util"].toggleBrowserWindow;
        const action = t.context.endpoints.toggleBrowserWindow;
        const payloads = [
            {forcedState: undefined},
            {forcedState: true},
            {forcedState: false},
        ];
        for (const payload of payloads) {
            await action(payload).toPromise();
            t.true(toggleBrowserWindowSpy.calledWithExactly(t.context.ctx, payload.forcedState));
        }
    },
    toggleCompactLayout: async (t) => {
        const endpoints = t.context.endpoints;
        const action = endpoints.toggleCompactLayout;

        const initial = await initConfig(endpoints);
        t.true(!initial.compactLayout);

        let updated = await action().toPromise();
        t.is(updated.compactLayout, true);

        await action().toPromise();
        updated = await t.context.ctx.configStore.readExisting();
        t.is(updated.compactLayout, false);
    },
    updateAccount: async (t) => {
        const endpoints = t.context.endpoints;
        const addHandler = endpoints.addAccount;
        const updateHandler = endpoints.updateAccount;
        const payload = {login: "login345", password: "password1", mailPassword: "mailPassword1", twoFactorCode: "2fa1"};
        const updatePatch: AccountConfigPatch = {login: "login345", passwordValue: "password2", twoFactorCodeValue: "2fa2"};

        await initConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        try {
            await updateHandler(payload).toPromise();
        } catch (err) {
            t.is(err.constructor.name, StatusCodeError.name, "StatusCodeError constructor");
            t.is(err.statusCode, StatusCode.NotFoundAccount, "StatusCode.NotFoundAccount");
        }

        const settings = await addHandler(payload).toPromise();
        const updatedSettings = await updateHandler(updatePatch).toPromise();
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
    },
    updateOverlayIcon: async (t) => {
        // TODO test "updateOverlayIcon" API
        t.pass();
    },
};

Object.entries(tests).forEach(([apiMethodName, method]) => {
    test.serial(`API: ${apiMethodName}`, method);
});

async function initConfig(endpoints: Endpoints): Promise<Config> {
    return await endpoints.readConfig().toPromise();
}

// tslint:disable-next-line:max-line-length
async function initConfigAndSettings(endpoints: Endpoints, payload: PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean }): Promise<Settings> {
    await initConfig(endpoints);
    return await endpoints.readSettings(payload).toPromise();
}

test.beforeEach(async (t) => {
    await (async () => {
        const openExternalSpy = sinon.spy();

        t.context.mocks = {
            "_@shared/api/main": {
                IPC_MAIN_API: {
                    registerApi: sinon.spy(),
                },
            },
            "./util": {
                toggleBrowserWindow: sinon.spy(),
                buildSettingsAdapter,
            },
            "about-window": {
                default: sinon.spy(),
            },
            "electron": {
                app: {
                    exit: sinon.spy(),
                    setAppUserModelId: sinon.spy(),
                },
                remote: {
                    BrowserWindow: sinon.spy(),
                },
                ipcMain: {
                    addListener: sinon.spy(),
                    emit: sinon.spy(),
                    on: sinon.spy(),
                    removeListener: sinon.spy(),
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
                    Object
                        .keys(t.context.mocks)
                        .forEach((key) => {
                            const mocks = t.context.mocks[key];
                            let mocked: any = mock(key);

                            if (!mocks._rewiremock_no_callThrough) {
                                mocked = mocked.callThrough();
                            }

                            mocked.with(mocks);
                        });
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

    memFsVolume._impl.mkdirpSync(process.cwd());

    // reducing work factor in order to speed-up the test process and make it less computing resources consuming
    encryptionPreset.keyDerivation = {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"};
    encryptionPreset.encryption = {type: "crypto", preset: "algorithm:aes-256-cbc"};

    logger.transports.file = ((msg: any) => {
        logger.transports.console(msg);
    }) as any;

    const ctx = await initContext({
        paths: {
            userDataDir: directory,
            appDir: directory,
        },
        storeFs: memFsVolume,
        initialStores,
    });

    t.true(ctx.configStore.optimisticLocking);
    t.true(ctx.settingsStore.optimisticLocking);
    t.falsy(ctx.settingsStore.adapter);
    t.truthy(ctx.settingsStore.validators && ctx.settingsStore.validators.length);

    t.context.ctx = ctx;
    t.context.endpoints = await t.context.mocked["./ipc-main-api"].initEndpoints(t.context.ctx);
    t.context.mocks["_@shared/api/main"].IPC_MAIN_API.registerApi.calledWithExactly(t.context.endpoints);
    // TODO make sure "IPC_MAIN_API.register" has been called
});
