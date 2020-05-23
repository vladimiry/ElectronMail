// TODO drop eslint disabling
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import assert from "assert";
import logger from "electron-log";
import path from "path";
import rewiremock from "rewiremock";
import sinon from "sinon";
import ava, {ExecutionContext, ImplementationResult, TestInterface} from "ava";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Fs} from "fs-json-store";
import {generate as generateRandomString} from "randomstring";
import {of} from "rxjs";
import {pick} from "remeda";
import {produce} from "immer";

import {AccountConfigCreateUpdatePatch, PasswordFieldContainer} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {StatusCodeError} from "src/shared/model/error";
import {accountPickingPredicate, pickBaseConfigProperties} from "src/shared/util";
import {buildSettingsAdapter} from "src/electron-main/util";

// TODO split this huge test file to pieces (test endpoints builders or even individual endpoints/methods)
// TODO "immer" instead of cloning with "..."

interface TestContext {
    ctx: Context;
    endpoints: StrictOmit<IpcMainApiEndpoints,
        // TODO test skipped methods
        | "activateBrowserWindow"
        | "applySavedProtonBackendSession"
        | "changeSpellCheckLocale"
        | "dbExport"
        | "dbFullTextSearch"
        | "dbGetAccountDataView"
        | "dbGetAccountMail"
        | "dbGetAccountMetadata"
        | "dbIndexerNotification"
        | "dbIndexerOn"
        | "dbPatch"
        | "dbSearchRootConversationNodes"
        | "findInPage"
        | "findInPageDisplay"
        | "findInPageNotification"
        | "findInPageStop"
        | "generateTOTPToken"
        | "getSpellCheckMetadata"
        | "hotkey"
        | "loadDatabase"
        | "notification"
        | "reEncryptSettings"
        | "resetProtonBackendSession"
        | "resetSavedProtonSession"
        | "resolveSavedProtonClientSession"
        | "saveProtonSession"
        | "selectAccount"
        | "spellCheck"
        | "staticInit"
        | "toggleBrowserWindow"
        | "toggleControls"
        | "toggleLocalDbMailsListViewMode"
        | "updateCheck"
        | "updateOverlayIcon">;
    mocks: Unpacked<ReturnType<typeof buildMocks>>; // eslint-disable-line @typescript-eslint/no-use-before-define
}

const test = ava as TestInterface<TestContext>;

const OPTIONS = {
    dataDirectory: path.join(
        process.cwd(),
        `electron-mail.spec`,
        `${path.basename(__filename)}-${Date.now()}`,
    ),
    masterPassword: "masterPassword123",
} as const;

function buildProtonmailAccountData(): Readonly<AccountConfigCreateUpdatePatch> {
    return {
        login: generateRandomString(),
        entryUrl: generateRandomString(),
        credentials: {
            password: generateRandomString(),
            twoFactorCode: generateRandomString(),
            mailPassword: generateRandomString(),
        },
    };
}

async function readConfig(endpoints: TestContext["endpoints"]): Promise<Config> {
    return endpoints.readConfig();
}

async function readConfigAndSettings(
    endpoints: TestContext["endpoints"], payload: PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean },
): Promise<Settings> {
    await readConfig(endpoints);
    return endpoints.readSettings(payload);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function buildMocks() {
    const openPathSpy = sinon.spy();
    const openExternalSpy = sinon.spy();

    return {
        "src/shared/api/main": {
            IPC_MAIN_API: {
                register: sinon.spy(),
            },
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        "src/electron-main/session": {
            initSessionByAccount: sinon.stub().returns(Promise.resolve()),
            configureSessionByAccount: sinon.stub().returns(Promise.resolve()),
            initSession: sinon.stub().returns(Promise.resolve()),
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
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        "src/electron-main/keytar": {
            getPassword: sinon.stub().returns(OPTIONS.masterPassword),
            deletePassword: sinon.spy(),
            setPassword: sinon.spy(),
        },
        "src/electron-main/window/full-text-search": {
            attachFullTextIndexWindow: sinon.stub().returns(Promise.resolve()),
            detachFullTextIndexWindow: sinon.stub().returns(Promise.resolve()),
        },
        "src/electron-main/window/about": {
            showAboutBrowserWindow: sinon.stub().returns(Promise.resolve()),
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
                openPathSpy,
                openPath: await (async () => { // eslint-disable-line @typescript-eslint/explicit-function-return-type
                    const openPath: (typeof import("electron"))["shell"]["openPath"] = async (url) => {
                        openPathSpy(url);
                        return "";
                    };
                    return openPath;
                })(),
                openExternalSpy,
                openExternal: await (async () => { // eslint-disable-line @typescript-eslint/explicit-function-return-type
                    const openExternal: (typeof import("electron"))["shell"]["openExternal"] = async (url) => {
                        openExternalSpy(url);
                    };
                    return openExternal;
                })(),
            },
            nativeImage: {
                createFromPath: sinon.stub().returns({toPNG: sinon.spy}),
                createFromBuffer: sinon.stub(),
            },
        },
    } as const;
}

const tests: Record<keyof TestContext["endpoints"], (t: ExecutionContext<TestContext>) => ImplementationResult> = {
    // TODO update "updateAccount" api method test (verify more fields)
    addAccount: async (t) => {
        const {
            endpoints,
            mocks: {"src/electron-main/session": {initSessionByAccount: initSessionByAccountMock}},
        } = t.context;
        const {addAccount} = endpoints;
        const payload = buildProtonmailAccountData();
        const settings = await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        t.is(0, initSessionByAccountMock.callCount);

        const updatedSettings = await addAccount(payload);
        const expectedSettings = produce(settings, (draft) => {
            (draft._rev as number)++;
            draft.accounts.push(payload);
        });

        t.is(updatedSettings.accounts.length, 1, `1 account`);
        t.deepEqual(updatedSettings, expectedSettings, `settings with added account is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `settings with added account is persisted`);
        const initSessionByAccount1Arg = pick(payload, ["login", "proxy"]);
        t.is(1, initSessionByAccountMock.callCount);
        initSessionByAccountMock.calledWithExactly(t.context.ctx, initSessionByAccount1Arg);

        try {
            await addAccount(payload);
        } catch ({message}) {
            const messageEnd = `Duplicate accounts identified. Duplicated logins: ${payload.login}.`;
            t.is(messageEnd, message.substr(message.indexOf(messageEnd)), "Account.login unique constraint");
        }

        const payload2: AccountConfigCreateUpdatePatch = {
            ...payload,
            ...{login: "login2", proxy: {proxyRules: "http=foopy:80;ftp=foopy2"}},
        };
        const updatedSettings2 = await addAccount(payload2);
        const expectedSettings2 = produce(updatedSettings, (draft) => {
            (draft._rev as number)++;
            draft.accounts.push(payload2);
        });

        t.is(updatedSettings2.accounts.length, 2);
        t.deepEqual(updatedSettings2, expectedSettings2, `settings with added account is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings2, `settings with added account is persisted`);
        const initSessionByAccount2Arg = pick(payload2, ["login", "proxy"]);
        t.is(2, initSessionByAccountMock.callCount);
        initSessionByAccountMock.calledWithExactly(t.context.ctx, initSessionByAccount2Arg);
    },

    // TODO update "updateAccount" api method test (verify more fields)
    updateAccount: async (t) => {
        const {
            endpoints,
            mocks: {"src/electron-main/session": {configureSessionByAccount: configureSessionByAccountMock}},
        } = t.context;
        const {addAccount, updateAccount} = endpoints;
        const addPayload = buildProtonmailAccountData();
        const updatePayload: AccountConfigCreateUpdatePatch = produce(addPayload, (draft) => {
            (draft.entryUrl as any) = generateRandomString(); // eslint-disable-line @typescript-eslint/no-explicit-any
            (draft.database as any) = Boolean(!draft.database); // eslint-disable-line @typescript-eslint/no-explicit-any
            draft.credentials.password = generateRandomString();
            draft.credentials.mailPassword = generateRandomString();
            draft.proxy = {proxyRules: "http=foopy:80;ftp=foopy2", proxyBypassRules: "<local>"};
        });

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        try {
            await updateAccount({...updatePayload, login: `${updatePayload.login}404`});
        } catch (err) {
            t.is(err.constructor.name, StatusCodeError.name, "StatusCodeError constructor");
            t.is(err.statusCode, StatusCodeError.getStatusCodeValue("NotFoundAccount"), "StatusCode.NotFoundAccount");
        }

        const settings = await addAccount(addPayload);
        const updatedSettings = await updateAccount(updatePayload);
        const expectedSettings = produce(settings, (draft) => {
            (draft._rev as number)++;
            Object.assign(draft.accounts[0], {...draft.accounts[0], ...updatePayload});
        });

        t.is(updatedSettings.accounts.length, 1, `1 account`);
        t.deepEqual(updatedSettings, expectedSettings, `settings with updated account is returned`);
        t.deepEqual(await t.context.ctx.settingsStore.read(), expectedSettings, `settings with updated account is persisted`);
        const configureSessionByAccountArg = pick(updatePayload, ["login", "proxy"]);
        t.is(1, configureSessionByAccountMock.callCount);
        configureSessionByAccountMock.calledWithExactly(configureSessionByAccountArg);
    },

    removeAccount: async (t) => {
        const {endpoints} = t.context;
        const {addAccount, removeAccount} = endpoints;
        const addProtonPayload = buildProtonmailAccountData();
        const addProtonPayload2 = buildProtonmailAccountData();
        const removePayload = {login: addProtonPayload.login};
        const removePayload404 = {login: "404 login"};

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        try {
            await removeAccount(removePayload404);
        } catch ({message}) {
            t.is(message, `Account with "${removePayload404.login}" login has not been found`, "404 account");
        }

        await addAccount(addProtonPayload);
        await addAccount(addProtonPayload2);

        const expectedSettings = produce(await t.context.ctx.settingsStore.readExisting(), (draft) => {
            (draft._rev as number)++;
            draft.accounts.splice(draft.accounts.findIndex(accountPickingPredicate(removePayload)), 1);
        });
        const updatedSettings = await removeAccount(removePayload);

        t.is(updatedSettings.accounts.length, 1, `1 account`);
        t.deepEqual(
            updatedSettings, expectedSettings as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            `settings with updated account is returned`,
        );
        t.deepEqual(
            await t.context.ctx.settingsStore.read(), expectedSettings as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            `settings with updated account is persisted`,
        );
    },

    changeAccountOrder: async (t) => {
        const {endpoints} = t.context;
        const {addAccount, changeAccountOrder} = endpoints;

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});

        await addAccount(buildProtonmailAccountData());
        await addAccount(buildProtonmailAccountData());
        let settings = await addAccount(buildProtonmailAccountData());

        await t.throwsAsync(changeAccountOrder({login: "login.404", index: 0}));
        await t.throwsAsync(changeAccountOrder({login: settings.accounts[0].login, index: -1}));
        await t.throwsAsync(changeAccountOrder({login: settings.accounts[0].login, index: settings.accounts.length}));
        await t.throwsAsync(changeAccountOrder({login: settings.accounts[0].login, index: settings.accounts.length + 1}));

        const expectedSettings = produce(settings, (draft) => {
            (draft._rev as number)++;
            draft.accounts = [
                draft.accounts[2],
                draft.accounts[0],
                draft.accounts[1],
            ];
        });
        const args = {account: settings.accounts[settings.accounts.length - 1], toIndex: 0};
        settings = await changeAccountOrder({login: args.account.login, index: args.toIndex});
        t.deepEqual(expectedSettings, settings);

        const expectedSettings2 = produce(settings, (draft) => draft);
        const args2 = {account: settings.accounts[settings.accounts.length - 1], toIndex: settings.accounts.length - 1};
        settings = await changeAccountOrder({login: args2.account.login, index: args2.toIndex});
        t.deepEqual(expectedSettings2, settings);
    },

    changeMasterPassword: async (t) => {
        const {endpoints} = t.context;
        const {changeMasterPassword} = endpoints;
        const payload = {password: OPTIONS.masterPassword, newPassword: "new password 1"};
        const emptyPasswordPayload = {password: "", newPassword: "new password 2"};
        const wrongPasswordPayload = {password: "wrong password", newPassword: "new password 3"};

        const settings = await readConfigAndSettings(endpoints, {password: payload.password});

        await t.throwsAsync(changeMasterPassword(emptyPasswordPayload), {message: /Decryption\sfailed/gi});
        await t.throwsAsync(changeMasterPassword(wrongPasswordPayload), {message: /Decryption\sfailed/gi});

        const updatedSettingsAdapter = t.context.ctx.settingsStore.adapter; // keep reference before update
        const updatedSettingsStore = t.context.ctx.settingsStore; // keep reference before update
        const updatedSettings = await changeMasterPassword(payload);
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

    // TODO actualize "init" endpoint test
    init: async (t) => {
        const result = await t.context.endpoints.init();
        t.is(typeof result.hasSavedPassword, "boolean");
    },

    logout: async (t) => {
        const {deletePassword: deletePasswordSpy} = t.context.mocks["src/electron-main/keytar"];
        const {endpoints} = t.context;
        const dbResetSpy = sinon.spy(t.context.ctx.db, "reset");
        const sessionDbResetSpy = sinon.spy(t.context.ctx.sessionDb, "reset");
        const sessionStorageResetSpy = sinon.spy(t.context.ctx.sessionStorage, "reset");
        const updateOverlayIconSpy = sinon.spy(
            endpoints as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            "updateOverlayIcon",
        );

        await endpoints.logout();
        t.falsy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 1);

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword});
        t.truthy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 1);

        await readConfigAndSettings(endpoints, {password: OPTIONS.masterPassword, savePassword: false});
        t.truthy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 2);

        await endpoints.logout();
        t.falsy(t.context.ctx.settingsStore.adapter);
        t.is(deletePasswordSpy.callCount, 3);

        t.is(2, dbResetSpy.callCount);
        t.is(2, sessionDbResetSpy.callCount);
        t.is(2, sessionStorageResetSpy.callCount);
        t.is(2, updateOverlayIconSpy.callCount);
    },

    openAboutWindow: async (t) => {
        const {showAboutBrowserWindow} = t.context.mocks["src/electron-main/window/about"];
        const action = t.context.endpoints.openAboutWindow;

        await action();

        t.true(showAboutBrowserWindow.calledWithExactly(t.context.ctx));
    },

    openExternal: async (t) => {
        const {openExternalSpy} = t.context.mocks.electron.shell;
        const action = t.context.endpoints.openExternal;

        const forbiddenUrls = [
            "file://some/file",
            "/some/path",
            "",
            undefined,
            null,
        ];
        for (const url of forbiddenUrls) {
            await t.throwsAsync(action({url: String(url)}), {message: `Forbidden url "${String(url)}" opening has been prevented`});
        }

        const allowedUrls = [
            "https://valid-url.com",
            "https://valid-url.com/page",
            "http://somedomain.com/",
            "http://somedomain.com/page",
        ];
        for (const url of allowedUrls) {
            // tslint:disable-next-line:await-promise
            await t.notThrowsAsync(action({url}));
            t.true(openExternalSpy.calledWith(url), `electron.shell.openPath.calledWith("${url}")`);
        }
    },

    openSettingsFolder: async (t) => {
        const {openPathSpy} = t.context.mocks.electron.shell;
        await t.context.endpoints.openSettingsFolder();
        t.true(openPathSpy.alwaysCalledWith(t.context.ctx.locations.userDataDir));
    },

    patchBaseConfig: async (t) => {
        const {endpoints} = t.context;
        const action = endpoints.patchBaseConfig;
        const patches: Array<Partial<BaseConfig>> = [
            {
                startHidden: false,
                layoutMode: "top",
                hideOnClose: false,
                unreadNotifications: true,
                checkUpdateAndNotify: true,
                logLevel: "warn",
            },
            {
                startHidden: true,
                layoutMode: undefined,
                hideOnClose: true,
                unreadNotifications: false,
                checkUpdateAndNotify: false,
                logLevel: "info",
            },
        ];

        await readConfig(endpoints);

        for (const patch of patches) {
            const initialConfig = await t.context.ctx.configStore.readExisting();
            const updatedConfig = await action(patch as BaseConfig);
            const actual = pickBaseConfigProperties(updatedConfig);
            const expected = pickBaseConfigProperties({...initialConfig, ...JSON.parse(JSON.stringify(patch))});

            t.deepEqual(actual, expected);
            t.deepEqual(await t.context.ctx.configStore.readExisting(), updatedConfig);
        }
    },

    quit: async (t) => {
        await t.context.endpoints.quit();
        t.is(t.context.mocks.electron.app.exit.callCount, 1, "electron.app.exit called once");
    },

    readConfig: async (t) => {
        t.false(await t.context.ctx.configStore.readable(), "config file does not exist");

        const initial = await readConfig(t.context.endpoints);

        const initialExpected = {...t.context.ctx.initialStores.config, ...{_rev: 0}};
        t.deepEqual(initial, initialExpected, "checking initial config file");
        t.true(await t.context.ctx.configStore.readable(), "config file exists");

        await readConfig(t.context.endpoints);
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

    settingsExists: async (t) => {
        t.false(await t.context.ctx.settingsStore.readable(), "store: settings file does not exist");
        await readConfigAndSettings(t.context.endpoints, {password: OPTIONS.masterPassword});
        t.true(await t.context.ctx.settingsStore.readable(), "store: settings file exists");
    },
};

Object.entries(tests).forEach(([apiMethodName, method]) => {
    test.serial(apiMethodName, method);
});

test.beforeEach(async (t) => {
    t.context.mocks = await buildMocks();

    const mockedModule = await rewiremock.around(
        async () => import("src/electron-main/api"),
        (mock) => {
            const {mocks} = t.context;
            mock("electron").with(mocks.electron);
            mock(async () => import("src/electron-main/keytar"))/*.callThrough()*/.with(mocks["src/electron-main/keytar"]);
            mock(async () => import("src/electron-main/window/full-text-search")).callThrough().with(mocks["src/electron-main/window/full-text-search"]); // eslint-disable-line max-len
            mock(async () => import("src/electron-main/window/about")).callThrough().with(mocks["src/electron-main/window/about"]);
            mock(async () => import("src/shared/api/main")).callThrough().with(mocks["src/shared/api/main"]);
            mock(async () => import("src/electron-main/session")).callThrough().with(mocks["src/electron-main/session"]);
            mock(async () => import("src/electron-main/util")).callThrough().with(mocks["src/electron-main/util"]);
            mock(async () => import("src/electron-main/storage-upgrade")).callThrough().with(mocks["src/electron-main/storage-upgrade"]);
            mock(async () => import("src/electron-main/api/endpoints-builders")).callThrough().with(mocks["./endpoints-builders"]);
        },
    );

    const testName = t.title;
    assert.ok(testName, "test name is not empty");
    const appDir = path.join(
        OPTIONS.dataDirectory,
        `${testName.replace(/[^A-Za-z0-9]/g, "_")}`,
    );
    const initialStores = {config: INITIAL_STORES.config(), settings: INITIAL_STORES.settings()};
    const {encryptionPreset} = initialStores.config;
    const memFsVolume = Fs.MemFs.volume();

    memFsVolume._impl.mkdirpSync(process.cwd());
    memFsVolume._impl.mkdirpSync(path.join(appDir, "web/browser-window"));
    memFsVolume._impl.writeFileSync(path.join(appDir, "web/browser-window/shared-vendor.css"), "");

    // reducing work factor in order to speed-up the test process and make it less computing resources consuming
    (encryptionPreset as import("ts-essentials").Writable<typeof encryptionPreset>).keyDerivation
        = {type: "sodium.crypto_pwhash", preset: "mode:interactive|algorithm:default"};
    (encryptionPreset as import("ts-essentials").Writable<typeof encryptionPreset>).encryption
        = {type: "crypto", preset: "algorithm:aes-256-cbc"};

    logger.transports.file = (
        (
            msg: any, // eslint-disable-line @typescript-eslint/no-explicit-any
        ) => {
            logger.transports.console(msg);
        }
    ) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const {initContext} = await rewiremock.around(
        async () => import("src/electron-main/context"),
        (mock) => {
            mock(async () => import("src/electron-main/protocol")).append({
                registerStandardSchemes: sinon.stub(),
                registerSessionProtocols: sinon.stub().returns(Promise.resolve({})),
            });
        },
    );

    const ctx = initContext({
        paths: {
            userDataDir: appDir,
            appDir,
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
    t.context.mocks["src/shared/api/main"].IPC_MAIN_API.register.calledWithExactly(t.context.endpoints);

    // TODO make sure "IPC_MAIN_API.register" has been called
});

