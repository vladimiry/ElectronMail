import rewiremock from "rewiremock";
import ava, {TestInterface} from "ava";
import sinon, {SinonStub} from "sinon";
import {Fs, Store} from "fs-json-store";

import {Config} from "src/shared/model/options";
import {Context} from "./model";
import {Endpoints} from "src/shared/api/main";
import {INITIAL_STORES} from "./constants";
import {ONE_SECOND_MS, PRODUCT_NAME, REPOSITORY_NAME} from "src/shared/constants";
import {asyncDelay} from "src/shared/util";

interface TestContext {
    ctx: any;
    endpoints: Record<keyof Pick<Endpoints, "readConfig" | "updateOverlayIcon" | "activateBrowserWindow">, SinonStub>;
    mocks: ReturnType<typeof buildMocks>;
}

const test = ava as TestInterface<TestContext>;

test.serial("workflow: root", async (t) => {
    await bootstrap(t.context);

    await asyncDelay(ONE_SECOND_MS);

    const m = t.context.mocks["~import"];

    t.true(m["electron-unhandled"].calledWithExactly(sinon.match.hasOwn("logger")));
    t.true(m["electron-unhandled"].calledBefore(m.electron.app.setAppUserModelId));

    t.true(m.electron.app.requestSingleInstanceLock.called);
    t.true(m.electron.app.requestSingleInstanceLock.calledAfter(m["electron-unhandled"]));

    const expectedAppId = "github.com/vladimiry/ElectronMail";
    t.is(`github.com/vladimiry/${PRODUCT_NAME}`, expectedAppId);
    t.is(`github.com/vladimiry/${REPOSITORY_NAME}`, expectedAppId);
    t.true(m.electron.app.setAppUserModelId.calledWithExactly(expectedAppId));
    t.true(m.electron.app.setAppUserModelId.calledAfter(m.electron.app.requestSingleInstanceLock));

    t.true(m["./util"].initContext.calledWithExactly());
    t.true(m["./util"].initContext.calledAfter(m.electron.app.setAppUserModelId));

    t.true(m.electron.app.commandLine.appendSwitch.calledAfter(m["./util"].initContext));

    t.true(m["./protocol"].registerStandardSchemes.calledWithExactly(t.context.ctx));
    t.true(m["./protocol"].registerStandardSchemes.calledAfter(m.electron.app.commandLine.appendSwitch));

    t.true(m["./session"].initSession.calledAfter(m["./protocol"].registerStandardSchemes));
});

test.serial("workflow: preAppReady", async (t) => {
    await bootstrap(t.context);

    const m = t.context.mocks["~import"];

    t.true(m.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", INITIAL_STORES.config().jsFlags.join(" ")));
});

test.serial("workflow: appReadyHandler", async (t) => {
    await bootstrap(t.context);

    await asyncDelay(ONE_SECOND_MS);

    const m = t.context.mocks["~import"];
    const {endpoints} = t.context;

    t.true(m["./session"].initSession.calledWithExactly(t.context.ctx, t.context.ctx.getDefaultSession));
    t.true(m["./session"].initSession.calledAfter(m["./util"].initContext));

    t.true(m["./api"].initApi.calledWithExactly(t.context.ctx));
    t.true(m["./api"].initApi.calledAfter(m["./session"].initSession));

    t.true(m["./web-contents"].initWebContentsCreatingHandlers.calledWithExactly(t.context.ctx));
    t.true(m["./web-contents"].initWebContentsCreatingHandlers.calledBefore(m["./window"].initBrowserWindow));
    t.true(m["./web-contents"].initWebContentsCreatingHandlers.calledBefore(m["./tray"].initTray));

    t.true(m["./window"].initBrowserWindow.calledWithExactly(t.context.ctx));

    t.true(m["./tray"].initTray.calledWithExactly(t.context.ctx));

    t.true(m["./menu"].initApplicationMenu.calledWithExactly(t.context.ctx));
    t.true(m["./menu"].initApplicationMenu.calledAfter(m["./tray"].initTray));

    t.true(endpoints.updateOverlayIcon.calledWithExactly({hasLoggedOut: false, unread: 0}));
    t.true(endpoints.updateOverlayIcon.calledAfter(m["./menu"].initApplicationMenu));

    t.true(m["./app-update"].initAutoUpdate.calledWithExactly());
});

test.serial("electron.app.commandLine.appendSwitch: empty values", async (t) => {
    const jsFlags: Exclude<Config["jsFlags"], undefined> = [];

    await bootstrap(
        t.context,
        {
            configStore: buildDefaultConfigStore({readFileSync: () => JSON.stringify({jsFlags})}),
        },
    );

    t.true(t.context.mocks["~import"].electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", ""));
});

test.serial("electron.app.commandLine.appendSwitch: custom values", async (t) => {
    const jsFlags: Exclude<Config["jsFlags"], undefined> = [
        "--some-val-1=111",
        "--some-val-2",
        "--some-val-3=333",
    ];

    await bootstrap(
        t.context,
        {
            configStore: buildDefaultConfigStore({readFileSync: () => JSON.stringify({jsFlags})}),
        },
    );

    t.true(t.context.mocks["~import"].electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", jsFlags.join(" ")));
});

test.serial("app.disableGpuProcess (false)", async (t) => {
    const {disableGpuProcess}: Pick<Config, "disableGpuProcess"> = {disableGpuProcess: false};

    await bootstrap(
        t.context,
        {
            configStore: buildDefaultConfigStore({readFileSync: () => JSON.stringify({disableGpuProcess})}),
        },
    );

    t.true(t.context.mocks["~import"].electron.app.disableHardwareAcceleration.notCalled);
});

test.serial("app.disableGpuProcess (true)", async (t) => {
    const {disableGpuProcess}: Pick<Config, "disableGpuProcess"> = {disableGpuProcess: true};

    await bootstrap(
        t.context,
        {
            configStore: buildDefaultConfigStore({readFileSync: () => JSON.stringify({disableGpuProcess})}),
        },
    );

    t.true(t.context.mocks["~import"].electron.app.disableHardwareAcceleration.calledWithExactly());
});

async function bootstrap(
    testContext: TestContext,
    contextAugmentation: Partial<Context> = {},
) {
    testContext.endpoints = {
        readConfig: sinon.stub().returns({
            toPromise: () => Promise.resolve(INITIAL_STORES.config()),
        }),
        updateOverlayIcon: sinon.stub().returns({
            toPromise: () => Promise.resolve(null),
        }),
        activateBrowserWindow: sinon.stub().returns({
            toPromise: () => Promise.resolve(INITIAL_STORES.config()),
        }),
    };

    testContext.ctx = {
        getDefaultSession: {},
        on: sinon.spy(),
        locations: {
            webClients: [],
        },
        configStore: buildDefaultConfigStore(),
        ...contextAugmentation,
    };

    testContext.mocks = buildMocks(testContext);

    await rewiremock.around(
        () => import("./index"),
        (mock) => {
            const mocks = testContext.mocks["~import"];
            mock(() => import("./session")).callThrough().with(mocks["./session"]);
            mock(() => import("./api")).callThrough().with(mocks["./api"]);
            mock(() => import("./util")).callThrough().with(mocks["./util"]);
            mock(() => import("./window")).callThrough().with(mocks["./window"]);
            mock(() => import("./tray")).callThrough().with(mocks["./tray"]);
            mock(() => import("./menu")).callThrough().with(mocks["./menu"]);
            mock(() => import("./web-contents")).with(mocks["./web-contents"]);
            mock(() => import("./app-update")).callThrough().with(mocks["./app-update"]);
            mock(() => import("./protocol")).callThrough().with(mocks["./protocol"]);
            mock(() => import("./keytar")).with({
                getPassword: sinon.spy(),
                deletePassword: sinon.spy(),
                setPassword: sinon.spy(),
            });
            mock(() => import("electron-unhandled")).with(mocks["electron-unhandled"]);
            mock(() => import("electron")).with(mocks.electron as any);
        },
    );
}

function buildDefaultConfigStore(fsImplPatch?: Partial<Store<Config>["fs"]["_impl"]>): Store<Config> {
    const memFsVolume = Fs.MemFs.volume();

    memFsVolume._impl.mkdirpSync(process.cwd());

    const store = new Store<Config>({
        fs: memFsVolume,
        file: "./config.json",
    });

    if (fsImplPatch) {
        Object.assign(store.fs._impl, fsImplPatch);
    }

    return store;
}

function buildMocks(testContext: TestContext) {
    return {
        "~import": {
            "./session": {
                getDefaultSession: sinon.stub().returns(testContext.ctx.getDefaultSession),
                initSession: sinon.stub().returns(Promise.resolve({})),
            },
            "./api": {
                initApi: sinon.stub().returns(Promise.resolve(testContext.endpoints)),
            },
            "./util": {
                initContext: sinon.stub().returns(testContext.ctx),
                activateBrowserWindow: sinon.spy(),
            },
            "./window": {
                initBrowserWindow: sinon.stub().returns(Promise.resolve({isDestroyed: sinon.spy()})),
            },
            "./tray": {
                initTray: sinon.stub().returns(Promise.resolve({})),
            },
            "./menu": {
                initApplicationMenu: sinon.stub().returns(Promise.resolve({})),
            },
            "./web-contents": {
                initWebContentsCreatingHandlers: sinon.spy(),
            },
            "./app-update": {
                initAutoUpdate: sinon.spy(),
            },
            "./protocol": {
                registerStandardSchemes: sinon.spy(),
            },
            "electron-unhandled": sinon.spy(),
            "electron": {
                app: {
                    setAppUserModelId: sinon.spy(),
                    requestSingleInstanceLock: sinon.stub().returns(true),
                    quit: sinon.spy(),
                    on: sinon.stub()
                        .callsArg(1)
                        .withArgs("web-contents-created")
                        .callsArgWith(1, {}, {on: sinon.spy()}),
                    commandLine: {
                        appendSwitch: sinon.spy(),
                    },
                    disableHardwareAcceleration: sinon.spy(),
                },
            },
        },
    };
}
