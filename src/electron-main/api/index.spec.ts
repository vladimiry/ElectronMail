import assert from "assert";
import logger from "electron-log";
import path from "path";
import rewiremock from "rewiremock";
import sinon from "sinon";
import ava, {ExecutionContext, ImplementationResult, TestInterface} from "ava";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Fs} from "fs-json-store";
import {generate as generateRandomString} from "randomstring";
import {mergeDeepRight, omit, pick} from "ramda";
import {of} from "rxjs";
import {produce} from "immer";

import {AccountConfigCreatePatch, AccountConfigUpdatePatch, PasswordFieldContainer} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {INITIAL_STORES} from "src/electron-main/constants";
import {StatusCodeError} from "src/shared/model/error";
import {Unpacked} from "src/shared/types";
import {accountPickingPredicate, pickBaseConfigProperties} from "src/shared/util";
import {buildSettingsAdapter} from "src/electron-main/util";

// TODO split this huge test file to pieces (test endpoints builders or even individual endpoints/methods)
// TODO "immer" instead of cloning with "..."

interface TestContext {
    ctx: Context;
    endpoints: Endpoints;
    mocks: Unpacked<ReturnType<typeof buildMocks>>;
}

const test = ava as TestInterface<TestContext>;

const OPTIONS = Object.freeze({
    dataDirectory: path.join(
        process.cwd(),
        `electron-mail.spec`,
        `${path.basename(__filename)}-${Number(new Date())}`,
    ),
    masterPassword: "masterPassword123",
});

const tests: Record<keyof Endpoints, (t: ExecutionContext<TestContext>) => ImplementationResult> = {
    log: async (t) => {
        t.pass(`TODO test "log" endpoint`);
    },

    addAccount: async (t) => {
        const {
            endpoints,
            mocks: {"src/electron-main/session": {initSessionByAccount: initSessionByAccountMock}},
        } = t.context;
        const {addAccount} = endpoints;
        const payload = buildProtonmailAccountData();
        const settings = await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});
        const initSessionByAccountOptions = {skipClearSessionCaches: true};

        t.is(0, initSessionByAccountMock.callCount);

        const updatedSettings = await addAccount(payload).toPromise();
        const expectedSettings = produce(settings, (draft) => {
            (draft._rev as number)++;
            draft.accounts.push(payload);
        });

        t.is(updatedSettings.accounts.length, 1, `1 account`);
        t.deepEqual(updatedSettings, expectedSettings, `settings with added account is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `settings with added account is persisted`);
        const initSessionByAccount1Arg = pick(["login", "proxy"], payload);
        t.is(1, initSessionByAccountMock.callCount);
        initSessionByAccountMock.calledWithExactly(t.context.ctx, initSessionByAccount1Arg, initSessionByAccountOptions);

        try {
            await addAccount(payload).toPromise();
        } catch ({message}) {
            const messageEnd = `Duplicate accounts identified. Duplicated logins: ${payload.login}.`;
            t.is(messageEnd, message.substr(message.indexOf(messageEnd)), "Account.login unique constraint");
        }

        const payload2: AccountConfigCreatePatch = {...payload, ...{login: "login2", proxy: {proxyRules: "http=foopy:80;ftp=foopy2"}}};
        const updatedSettings2 = await addAccount(payload2).toPromise();
        const expectedSettings2 = produce(updatedSettings, (draft) => {
            (draft._rev as number)++;
            draft.accounts.push(payload2);
        });

        t.is(updatedSettings2.accounts.length, 2, `2 accounts`);
        t.deepEqual(updatedSettings2, expectedSettings2, `settings with added account is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings2, `settings with added account is persisted`);
        const initSessionByAccount2Arg = pick(["login", "proxy"], payload2);
        t.is(2, initSessionByAccountMock.callCount);
        initSessionByAccountMock.calledWithExactly(t.context.ctx, initSessionByAccount2Arg, initSessionByAccountOptions);
    },

    updateAccount: async (t) => {
        const {
            endpoints,
            mocks: {"src/electron-main/session": {configureSessionByAccount: configureSessionByAccountMock}},
        } = t.context;
        const {addAccount, updateAccount} = endpoints;
        const addPayload = buildProtonmailAccountData();
        const updatePayload: AccountConfigUpdatePatch = produce(omit(["type"], addPayload), (draft) => {
            (draft.entryUrl as any) = generateRandomString();
            (draft.database as any) = Boolean(!draft.database);
            draft.credentials.password = generateRandomString();
            draft.credentials.mailPassword = generateRandomString();
            draft.proxy = {proxyRules: "http=foopy:80;ftp=foopy2", proxyBypassRules: "<local>"};
        });

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        try {
            await updateAccount({...updatePayload, login: `${updatePayload.login}404`}).toPromise();
        } catch (err) {
            t.is(err.constructor.name, StatusCodeError.name, "StatusCodeError constructor");
            t.is(err.statusCode, StatusCodeError.getStatusCodeValue("NotFoundAccount"), "StatusCode.NotFoundAccount");
        }

        const settings = await addAccount(addPayload).toPromise();
        const updatedSettings = await updateAccount(updatePayload).toPromise();
        const expectedSettings = produce(settings, (draft) => {
            (draft._rev as number)++;
            Object.assign(draft.accounts[0], mergeDeepRight(draft.accounts[0], updatePayload));
        });

        t.is(updatedSettings.accounts.length, 1, `1 account`);
        t.deepEqual(updatedSettings, expectedSettings, `settings with updated account is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `settings with updated account is persisted`);
        const configureSessionByAccountArg = pick(["login", "proxy"], updatePayload);
        t.is(1, configureSessionByAccountMock.callCount);
        configureSessionByAccountMock.calledWithExactly(configureSessionByAccountArg);
    },

    removeAccount: async (t) => {
        const {endpoints} = t.context;
        const {addAccount, removeAccount} = endpoints;
        const addProtonPayload = buildProtonmailAccountData();
        const addTutanotaPayload = buildTutanotaAccountData();
        const removePayload = {login: addProtonPayload.login};
        const removePayload404 = {login: "404 login"};

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        try {
            await removeAccount(removePayload404).toPromise();
        } catch ({message}) {
            t.is(message, `Account with "${removePayload404.login}" login has not been found`, "404 account");
        }

        await addAccount(addProtonPayload).toPromise();
        await addAccount(addTutanotaPayload).toPromise();

        const expectedSettings = produce(await t.context.ctx.settingsStore.readExisting(), (draft) => {
            (draft._rev as number)++;
            draft.accounts.splice(draft.accounts.findIndex(accountPickingPredicate(removePayload)), 1);
        });
        const updatedSettings = await removeAccount(removePayload).toPromise();

        t.is(updatedSettings.accounts.length, 1, `1 account`);
        t.deepEqual(updatedSettings, expectedSettings as any, `settings with updated account is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings as any, `settings with updated account is persisted`);
    },

    changeAccountOrder: async (t) => {
        const {endpoints} = t.context;
        const {addAccount, changeAccountOrder} = endpoints;

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        await addAccount(buildProtonmailAccountData()).toPromise();
        await addAccount(buildProtonmailAccountData()).toPromise();
        let settings = await addAccount(buildTutanotaAccountData()).toPromise();

        await t.throwsAsync(changeAccountOrder({login: "login.404", index: 0}).toPromise());
        await t.throwsAsync(changeAccountOrder({login: settings.accounts[0].login, index: -1}).toPromise());
        await t.throwsAsync(changeAccountOrder({login: settings.accounts[0].login, index: settings.accounts.length}).toPromise());
        await t.throwsAsync(changeAccountOrder({login: settings.accounts[0].login, index: settings.accounts.length + 1}).toPromise());

        const expectedSettings = produce(settings, (draft) => {
            (draft._rev as number)++;
            draft.accounts = [
                draft.accounts[2],
                draft.accounts[0],
                draft.accounts[1],
            ];
        });
        const args = {account: settings.accounts[settings.accounts.length - 1], toIndex: 0};
        settings = await changeAccountOrder({login: args.account.login, index: args.toIndex}).toPromise();
        t.deepEqual(expectedSettings, settings);

        const expectedSettings2 = produce(settings, (draft) => draft);
        const args2 = {account: settings.accounts[settings.accounts.length - 1], toIndex: settings.accounts.length - 1};
        settings = await changeAccountOrder({login: args2.account.login, index: args2.toIndex}).toPromise();
        t.deepEqual(expectedSettings2, settings);
    },

    changeMasterPassword: async (t) => {
        const {endpoints} = t.context;
        const {changeMasterPassword} = endpoints;
        const payload = {password: OPTIONS.masterPassword, newPassword: "new password 1"};
        const emptyPasswordPayload = {password: "", newPassword: "new password 2"};
        const wrongPasswordPayload = {password: "wrong password", newPassword: "new password 3"};

        const settings = await readConfigAndSettings(endpoints, {password: payload.password});

        await t.throwsAsync(changeMasterPassword(emptyPasswordPayload).toPromise(), /Decryption\sfailed/gi);
        await t.throwsAsync(changeMasterPassword(wrongPasswordPayload).toPromise(), /Decryption\sfailed/gi);

        const updatedSettingsAdapter = t.context.ctx.settingsStore.adapter; // keep reference before update
        const updatedSettingsStore = t.context.ctx.settingsStore; // keep reference before update
        const updatedSettings = await changeMasterPassword(payload).toPromise();
        const expectedSettings = {
            ...settings,
            _rev: (settings._rev as number) + 1,
        };
        t.truthy(t.context.ctx.settingsStore, `store is defined`);
        t.not(t.context.ctx.settingsStore, updatedSettingsStore, `new store reference`);
        t.not(t.context.ctx.settingsStore.adapter, updatedSettingsAdapter, `new store.adapter reference`);
        t.deepEqual(updatedSettings, expectedSettings, `re-saved settings is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `re-saved settings is persisted`);
        const newStore = t.context.ctx.settingsStore.clone(
            {adapter: await buildSettingsAdapter(t.context.ctx, payload.newPassword)},
        );
        t.deepEqual(await newStore.read(), expectedSettings, `reading re-saved settings with new password`);

        const {getPassword: getPasswordStub, setPassword: setPasswordSpy} = t.context.mocks["src/electron-main/keytar"];
        t.is(getPasswordStub.callCount, 1);
        getPasswordStub.calledWithExactly();
        t.is(setPasswordSpy.callCount, 1);
        setPasswordSpy.calledWithExactly(payload.newPassword);
    },

    dbPatch: (t) => {
        t.pass(`TODO test "dbPatch" endpoint`);
    },

    dbGetAccountMetadata: (t) => {
        t.pass(`TODO test "dbGetAccountMetadata" endpoint`);
    },

    dbGetAccountDataView: (t) => {
        t.pass(`TODO test "dbGetAccountMetadata" endpoint`);
    },

    dbGetAccountMail: (t) => {
        t.pass(`TODO test "dbGetAccountMail" endpoint`);
    },

    dbExport: (t) => {
        t.pass(`TODO test "dbExport" endpoint`);
    },

    dbSearchRootConversationNodes: (t) => {
        t.pass(`TODO test "dbSearchRootConversationNodes" endpoint`);
    },

    dbFullTextSearch: (t) => {
        t.pass(`TODO test "dbFullTextSearch" endpoint`);
    },

    dbIndexerOn: (t) => {
        t.pass(`TODO test "dbIndexerOn" endpoint`);
    },

    dbIndexerNotification: (t) => {
        t.pass(`TODO test "dbIndexerNotification" endpoint`);
    },

    // TODO actualize "init" endpoint test
    init: async (t) => {
        const result = await t.context.endpoints.init().toPromise();

        t.deepEqual(result.electronLocations, t.context.ctx.locations);
        t.is(typeof result.hasSavedPassword, "boolean");
    },

    migrate: (t) => {
        t.pass(`TODO test "migrate" endpoint`);
    },

    logout: async (t) => {
        const {deletePassword: deletePasswordSpy} = t.context.mocks["src/electron-main/keytar"];
        const {clearSessionsCache} = t.context.mocks["src/electron-main/session"];
        const {endpoints} = t.context;
        const resetSpy = sinon.spy(t.context.ctx.db, "reset");
        const updateOverlayIconSpy = sinon.spy(endpoints, "updateOverlayIcon");

        await endpoints.logout().toPromise();
        t.falsy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 1);

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});
        t.truthy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 1);

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword, savePassword: false});
        t.truthy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 2);

        await endpoints.logout().toPromise();
        t.falsy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 3);

        t.is(2, resetSpy.callCount);
        t.is(2, clearSessionsCache.callCount);
        t.is(2, updateOverlayIconSpy.callCount);
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
            await t.throwsAsync(action({url: String(url)}).toPromise(), `Forbidden url "${url}" opening has been prevented`);
        }

        const allowedUrls = [
            "https://valid-url.com",
            "https://valid-url.com/page",
            "http://somedomain.com/",
            "http://somedomain.com/page",
        ];
        for (const url of allowedUrls) {
            // tslint:disable-next-line:await-promise
            await t.notThrowsAsync(action({url: url as string}).toPromise());
            t.true(openExternalSpy.calledWith(url), `electron.shell.openExternal.calledWith("${url}")`);
        }
    },

    openSettingsFolder: async (t) => {
        const openItemSpy: sinon.SinonSpy = t.context.mocks.electron.shell.openItem;
        await t.context.endpoints.openSettingsFolder().toPromise();
        t.true(openItemSpy.alwaysCalledWith(t.context.ctx.locations.userDataDir));
    },

    patchBaseConfig: async (t) => {
        const endpoints = t.context.endpoints;
        const action = endpoints.patchBaseConfig;
        const patches: BaseConfig[] = [
            {
                startMinimized: false,
                compactLayout: true,
                closeToTray: false,
                unreadNotifications: true,
                checkForUpdatesAndNotify: true,
                logLevel: "warn",
            },
            {
                startMinimized: true,
                compactLayout: undefined,
                closeToTray: true,
                unreadNotifications: false,
                checkForUpdatesAndNotify: false,
                logLevel: "info",
            },
        ];

        await readConfig(endpoints);

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
        const upgradeConfigSpy = t.context.mocks["src/electron-main/storage-upgrade"].upgradeConfig;

        t.false(await t.context.ctx.configStore.readable(), "config file does not exist");

        const initial = await readConfig(t.context.endpoints);
        t.is(0, upgradeConfigSpy.callCount);

        const initialExpected = {...t.context.ctx.initialStores.config, ...{_rev: 0}};
        t.deepEqual(initial, initialExpected, "checking initial config file");
        t.true(await t.context.ctx.configStore.readable(), "config file exists");

        await readConfig(t.context.endpoints);
        t.is(1, upgradeConfigSpy.callCount);
    },

    readSettings: async (t) => {
        const {
            endpoints,
            mocks: {
                "src/electron-main/keytar": {setPassword: setPasswordSpy, deletePassword: deletePasswordSpy},
                "src/electron-main/storage-upgrade": {upgradeSettings: upgradeSettingsSpy},
                "src/electron-main/session": {initSessionByAccount: initSessionByAccountMock},
            },
        } = t.context;

        t.false(await t.context.ctx.settingsStore.readable(), "settings file does not exist");
        t.falsy(t.context.ctx.settingsStore.adapter, "adapter is not set");
        const initial = await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword, savePassword: false});
        t.is(0, upgradeSettingsSpy.callCount);
        t.is(t.context.ctx.settingsStore.adapter && t.context.ctx.settingsStore.adapter.constructor.name,
            EncryptionAdapter.name,
            "adapter is an EncryptionAdapter",
        );
        const initialExpected = {...t.context.ctx.initialStores.settings, ...{_rev: 0}};
        t.deepEqual(initial, initialExpected, "checking initial settings file");
        t.true(await t.context.ctx.settingsStore.readable(), "settings file exists");
        t.is(setPasswordSpy.callCount, 0);
        t.is(deletePasswordSpy.callCount, 1);
        t.true(deletePasswordSpy.alwaysCalledWithExactly());
        t.is(initial.accounts.length, initSessionByAccountMock.callCount);
        for (const {login} of initial.accounts) {
            t.true(initSessionByAccountMock.calledWithExactly(t.context.ctx, login));
        }

        const initialUpdated = await t.context.ctx.settingsStore.write(initial);
        const initialUpdatedExpected = {...initial, ...initialExpected, ...{_rev: initialExpected._rev + 1}};
        t.deepEqual(initialUpdated, initialUpdatedExpected, "saved initial settings file");
        t.deepEqual(await t.context.ctx.settingsStore.read(), initialUpdatedExpected, "loaded initial settings file");

        const final = await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword, savePassword: true});
        t.is(1, upgradeSettingsSpy.callCount);
        t.is(setPasswordSpy.callCount, 1);
        t.is(deletePasswordSpy.callCount, 1);
        setPasswordSpy.calledWithExactly(OPTIONS.masterPassword);
        for (const {login} of final.accounts) {
            t.true(initSessionByAccountMock.calledWithExactly(t.context.ctx, login));
        }
        t.is(initial.accounts.length + final.accounts.length, initSessionByAccountMock.callCount);
    },

    // TODO test "reEncryptSettings" API
    reEncryptSettings: async (t) => {
        t.pass();
    },

    settingsExists: async (t) => {
        t.false(await t.context.ctx.settingsStore.readable(), "store: settings file does not exist");
        await readConfigAndSettings(t.context.endpoints, {password: OPTIONS.masterPassword});
        t.true(await t.context.ctx.settingsStore.readable(), "store: settings file exists");
    },

    // TODO test "loadDatabase" API
    loadDatabase: (t) => {
        t.pass();
    },

    // TODO test "activateBrowserWindow" API
    activateBrowserWindow: (t) => {
        t.pass();
    },

    // TODO test "toggleBrowserWindow" API
    toggleBrowserWindow: (t) => {
        t.pass();
    },

    toggleCompactLayout: async (t) => {
        const endpoints = t.context.endpoints;
        const action = endpoints.toggleCompactLayout;

        const config1 = await readConfig(endpoints);
        t.true(config1.compactLayout);

        const config2 = await action().toPromise();
        t.is(config2.compactLayout, !config1.compactLayout);

        await action().toPromise();
        const config3 = await t.context.ctx.configStore.readExisting();
        t.is(config3.compactLayout, !config2.compactLayout);
    },

    // TODO test "updateOverlayIcon" API
    updateOverlayIcon: async (t) => {
        t.pass();
    },

    // TODO test "hotkey" API
    selectAccount: (t) => {
        t.pass();
    },

    // TODO test "hotkey" API
    hotkey: (t) => {
        t.pass();
    },

    // TODO test "findInPageDisplay" API
    findInPageDisplay: (t) => {
        t.pass();
    },

    // TODO test "findInPage" API
    findInPage: (t) => {
        t.pass();
    },

    // TODO test "findInPageStop" API
    findInPageStop: (t) => {
        t.pass();
    },

    // TODO test "findInPageNotification" API
    findInPageNotification: (t) => {
        t.pass();
    },

    // TODO test "notification" API
    notification: (t) => {
        t.pass();
    },
};

Object.entries(tests).forEach(([apiMethodName, method]) => {
    test.serial(apiMethodName, method);
});

async function readConfig(endpoints: Endpoints): Promise<Config> {
    return await endpoints.readConfig().toPromise();
}

async function readConfigAndSettings(
    endpoints: Endpoints, payload: PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean },
): Promise<Settings> {
    await readConfig(endpoints);
    return await endpoints.readSettings(payload).toPromise();
}

async function buildMocks() {
    const openExternalSpy = sinon.spy();

    return {
        "src/shared/api/main": {
            IPC_MAIN_API: {
                registerApi: sinon.spy(),
            },
        } as any,
        "src/electron-main/session": {
            initSessionByAccount: sinon.stub().returns(Promise.resolve()),
            configureSessionByAccount: sinon.stub().returns(Promise.resolve()),
            initSession: sinon.stub().returns(Promise.resolve()),
            clearSessionsCache: sinon.stub().returns(Promise.resolve()),
            clearSessionCaches: sinon.stub().returns(Promise.resolve()),
            getDefaultSession: sinon.stub().returns({}),
        },
        "src/electron-main/util": {
            buildSettingsAdapter,
        },
        "src/electron-main/storage-upgrade": {
            upgradeConfig: sinon.stub().returns(false),
            upgradeSettings: sinon.stub().returns(false),
        },
        "./endpoints-builders": {
            TrayIcon: {
                buildEndpoints: sinon.stub().returns(Promise.resolve({updateOverlayIcon: () => of(null)})),
            },
        } as any,
        "src/electron-main/keytar": {
            getPassword: sinon.stub().returns(OPTIONS.masterPassword),
            deletePassword: sinon.spy(),
            setPassword: sinon.spy(),
        },
        "src/electron-main/window/full-text-search": {
            attachFullTextIndexWindow: sinon.stub().returns(Promise.resolve()),
            detachFullTextIndexWindow: sinon.stub().returns(Promise.resolve()),
        },
        "about-window": {
            default: sinon.spy(),
        },
        "electron": {
            app: {
                exit: sinon.spy(),
                setAppUserModelId: sinon.spy(),
                on: sinon.stub()
                    .callsArg(1)
                    .withArgs("ready")
                    .callsArgWith(1, {}, {on: sinon.spy()}),
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
            nativeImage: {
                createFromPath: sinon.stub().returns({toPNG: sinon.spy}),
                createFromBuffer: sinon.stub(),
            },
        } as any,
    };
}

test.beforeEach(async (t) => {
    t.context.mocks = await buildMocks();

    const mockedModule = await rewiremock.around(
        () => import("./index"),
        (mock) => {
            const {mocks} = t.context;
            mock("electron").with(mocks.electron);
            mock(() => import("src/electron-main/keytar"))/*.callThrough()*/.with(mocks["src/electron-main/keytar"]);
            mock(() => import("src/electron-main/window/full-text-search")).callThrough().with(mocks["src/electron-main/window/full-text-search"]); // tslint:disable-line:max-line-length
            mock(() => import("about-window")).callThrough().with(mocks["about-window"] as any);
            mock(() => import("src/shared/api/main")).callThrough().with(mocks["src/shared/api/main"]);
            mock(() => import("src/electron-main/session")).callThrough().with(mocks["src/electron-main/session"]);
            mock(() => import("src/electron-main/util")).callThrough().with(mocks["src/electron-main/util"]);
            mock(() => import("src/electron-main/storage-upgrade")).callThrough().with(mocks["src/electron-main/storage-upgrade"]);
            mock(() => import("./endpoints-builders")).callThrough().with(mocks["./endpoints-builders"]);
        },
    );

    const testName = t.title;
    assert.ok(testName, "test name is not empty");
    const directory = path.join(
        OPTIONS.dataDirectory,
        `${testName.replace(/[^A-Za-z0-9]/g, "_")}`,
    );
    const initialStores = {config: INITIAL_STORES.config(), settings: INITIAL_STORES.settings()};
    const encryptionPreset = initialStores.config.encryptionPreset;
    const memFsVolume = Fs.MemFs.volume();

    memFsVolume._impl.mkdirpSync(process.cwd());

    // reducing work factor in order to speed-up the test process and make it less computing resources consuming
    encryptionPreset.keyDerivation = {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"};
    encryptionPreset.encryption = {type: "crypto", preset: "algorithm:aes-256-cbc"};

    logger.transports.file = ((msg: any) => {
        logger.transports.console(msg);
    }) as any;

    const {initContext} = await rewiremock.around(
        () => import("src/electron-main/util"),
        (mock) => {
            mock(() => import("src/electron-main/protocol")).append({
                registerStandardSchemes: sinon.stub(),
                registerSessionProtocols: sinon.stub().returns(Promise.resolve({})),
            });
        },
    );

    const ctx = initContext({
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
    t.context.endpoints = await mockedModule.initApi(t.context.ctx);
    t.context.mocks["src/shared/api/main"].IPC_MAIN_API.registerApi.calledWithExactly(t.context.endpoints);

    // TODO make sure "IPC_MAIN_API.register" has been called
});

function buildProtonmailAccountData(): Readonly<AccountConfigCreatePatch<"protonmail">> {
    return {
        type: "protonmail",
        login: generateRandomString(),
        entryUrl: generateRandomString(),
        credentials: {
            password: generateRandomString(),
            twoFactorCode: generateRandomString(),
            mailPassword: generateRandomString(),
        },
    };
}

function buildTutanotaAccountData(): Readonly<AccountConfigCreatePatch<"tutanota">> {
    return {
        type: "tutanota",
        login: generateRandomString(),
        entryUrl: generateRandomString(),
        credentials: {
            password: generateRandomString(),
            twoFactorCode: generateRandomString(),
        },
    };
}
