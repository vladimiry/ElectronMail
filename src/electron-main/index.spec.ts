import ava, {TestInterface} from "ava";
import rewiremock from "rewiremock";
import sinon, {SinonStub} from "sinon";

import {APP_NAME} from "src/shared/constants";
import {Endpoints} from "src/shared/api/main";
import {INITIAL_STORES} from "./constants";

interface TestContext {
    ctx: any;
    endpoints: Record<keyof Pick<Endpoints, "readConfig" | "updateOverlayIcon">, SinonStub>;
    mocks: ReturnType<typeof buildMocks>;
}

const test = ava as TestInterface<TestContext>;

test.serial("workflow", async (t) => {
    const m = t.context.mocks["~index"];
    const {endpoints} = t.context;

    // tslint:disable:max-line-length
    t.true(m["electron-unhandled"].calledWithExactly(sinon.match.hasOwn("logger")), `"electronUnhandled" called`);
    t.true(m["electron-unhandled"].calledBefore(m.electron.app.makeSingleInstance), `"electronUnhandled" called before "makeSingleInstance"`);
    t.true(m.electron.app.setAppUserModelId.calledWithExactly(`com.github.vladimiry.${APP_NAME}`));
    t.true(m.electron.app.setAppUserModelId.calledBefore(m.electron.app.makeSingleInstance));
    t.true(m.electron.app.makeSingleInstance.called, `"makeSingleInstance" called`);
    t.true(m.electron.app.makeSingleInstance.calledBefore(m["./util"].initContext), `"makeSingleInstance" called before "initContext"`);
    t.true(m["./util"].initContext.calledWithExactly(), `"initContext" called`);
    t.true(m["./api"].initApi.calledWithExactly(t.context.ctx), `"initApi" called`);
    t.true(m["./web-content-context-menu"].initWebContentContextMenu.calledWithExactly(t.context.ctx), `initWebContentContextMenu called`);
    t.true(m["./web-content-context-menu"].initWebContentContextMenu.calledBefore(m["./window"].initBrowserWindow), `initWebContentContextMenu called before "initBrowserWindow"`);
    t.true(m["./window"].initBrowserWindow.calledWithExactly(t.context.ctx, t.context.endpoints), `"initBrowserWindow" called`);
    t.true(m["./tray"].initTray.calledWithExactly(endpoints), `"initTray" called`);
    t.true(endpoints.updateOverlayIcon.calledWithExactly({hasLoggedOut: false, unread: 0}), `"updateOverlayIcon" called`);
    t.true(endpoints.updateOverlayIcon.calledAfter(m["./tray"].initTray), `"updateOverlayIcon" called after "initTray"`);
    t.true(m["./app-update"].initAutoUpdate.calledWithExactly(), `"initAutoUpdate" called`);
    // tslint:enable:max-line-length
});

test.beforeEach(async (t) => {
    t.context.endpoints = {
        readConfig: sinon.stub().returns({
            toPromise: () => Promise.resolve(INITIAL_STORES.config),
        }),
        updateOverlayIcon: sinon.stub().returns({
            toPromise: () => Promise.resolve(null),
        }),
    };

    t.context.ctx = {
        on: sinon.spy(),
    };

    t.context.mocks = buildMocks(t.context);

    await rewiremock.around(
        () => import("./index"),
        (mock) => {
            const mocks = t.context.mocks["~index"];

            mock(() => import("./api")).callThrough().with(mocks["./api"]);
            mock(() => import("./util")).callThrough().with(mocks["./util"]);
            mock("./window").with(mocks["./window"]);
            mock("./tray").with(mocks["./tray"]);
            mock("./web-content-context-menu").with(mocks["./web-content-context-menu"]);
            mock("./app-update").with(mocks["./app-update"]);
            mock("keytar").with({
                getPassword: sinon.spy(),
                deletePassword: sinon.spy(),
                setPassword: sinon.spy(),
            });
            mock("electron-unhandled").with(mocks["electron-unhandled"]);
            mock("electron").with(mocks.electron);
        },
    );
});

function buildMocks(testContext: TestContext) {
    return {
        "~index": {
            "./api": {
                initApi: sinon.stub().returns(Promise.resolve(testContext.endpoints)),
            },
            "./util": {
                initContext: sinon.stub().resolves(testContext.ctx),
                activateBrowserWindow: sinon.spy(),
            },
            "./window": {
                initBrowserWindow: sinon.spy(),
            },
            "./tray": {
                initTray: sinon.spy(),
            },
            "./web-content-context-menu": {
                initWebContentContextMenu: sinon.spy(),
            },
            "./app-update": {
                initAutoUpdate: sinon.spy(),
            },
            "electron-unhandled": sinon.spy(),
            "electron": {
                app: {
                    setAppUserModelId: sinon.spy(),
                    makeSingleInstance: sinon.spy(),
                    quit: sinon.spy(),
                    on: sinon.stub()
                        .callsArg(1)
                        .withArgs("web-contents-created")
                        .callsArgWith(1, {}, {on: sinon.spy()}),
                },
            },
        },
    };
}
