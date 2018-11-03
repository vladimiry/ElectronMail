import rewiremock from "rewiremock";
import ava, {TestInterface} from "ava";
import sinon, {SinonStub} from "sinon";

import {APP_NAME, ONE_SECOND_MS} from "src/shared/constants";
import {Endpoints} from "src/shared/api/main";
import {INITIAL_STORES} from "./constants";
import {asyncDelay} from "src/shared/util";

interface TestContext {
    ctx: any;
    endpoints: Record<keyof Pick<Endpoints, "readConfig" | "updateOverlayIcon" | "activateBrowserWindow">, SinonStub>;
    mocks: ReturnType<typeof buildMocks>;
}

const test = ava as TestInterface<TestContext>;

// tslint:disable:max-line-length
test.serial("workflow", async (t) => {
    await asyncDelay(ONE_SECOND_MS);

    const m = t.context.mocks["~index"];
    const {endpoints} = t.context;

    t.true(m["electron-unhandled"].calledWithExactly(sinon.match.hasOwn("logger")), `"electronUnhandled" called`);
    t.true(m["electron-unhandled"].calledBefore(m.electron.app.setAppUserModelId), `"electronUnhandled" called before "requestSingleInstanceLock"`);

    t.true(m.electron.app.setAppUserModelId.calledWithExactly(`com.github.vladimiry.${APP_NAME}`));
    t.true(m.electron.app.setAppUserModelId.calledBefore(m.electron.app.requestSingleInstanceLock));

    t.true(m.electron.app.requestSingleInstanceLock.called, `"requestSingleInstanceLock" called`);
    t.true(m.electron.app.requestSingleInstanceLock.calledBefore(m["./util"].initContext), `"requestSingleInstanceLock" called before "initContext"`);

    t.true(m["./util"].initContext.calledWithExactly(), `"initContext" called`);

    t.true(m["./session"].clearDefaultSessionCaches.calledWithExactly(), `"clearDefaultSessionCaches" called`);
    t.true(m["./session"].clearDefaultSessionCaches.calledAfter(m["./util"].initContext), `"clearDefaultSessionCaches" called after "initContext"`);

    t.true(m["./api"].initApi.calledWithExactly(t.context.ctx), `"initApi" called`);
    t.true(m["./api"].initApi.calledAfter(m["./session"].clearDefaultSessionCaches), `"initApi" called after "clearDefaultSessionCaches"`);

    t.true(m["./web-content-context-menu"].initWebContentContextMenu.calledWithExactly(), `"initWebContentContextMenu" called`);
    t.true(m["./web-content-context-menu"].initWebContentContextMenu.calledBefore(m["./window"].initBrowserWindow), `"initWebContentContextMenu" called before "initBrowserWindow"`);
    t.true(m["./web-content-context-menu"].initWebContentContextMenu.calledBefore(m["./tray"].initTray), `"initWebContentContextMenu" called before "initTray"`);

    t.true(m["./window"].initBrowserWindow.calledWithExactly(t.context.ctx, t.context.endpoints), `"initBrowserWindow" called`);

    t.true(m["./tray"].initTray.calledWithExactly(endpoints), `"initTray" called`);

    t.true(endpoints.updateOverlayIcon.calledWithExactly({hasLoggedOut: false, unread: 0}), `"updateOverlayIcon" called`);
    t.true(endpoints.updateOverlayIcon.calledAfter(m["./tray"].initTray), `"updateOverlayIcon" called after "initTray"`);

    t.true(m["./app-update"].initAutoUpdate.calledWithExactly(), `"initAutoUpdate" called`);
});
// tslint:enable:max-line-length

test.beforeEach(async (t) => {
    t.context.endpoints = {
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

    t.context.ctx = {
        on: sinon.spy(),
    };

    t.context.mocks = buildMocks(t.context);

    await rewiremock.around(
        () => import("./index"),
        (mock) => {
            const mocks = t.context.mocks["~index"];
            mock(() => import("./session")).callThrough().with(mocks["./session"]);
            mock(() => import("./api")).callThrough().with(mocks["./api"]);
            mock(() => import("./util")).callThrough().with(mocks["./util"]);
            mock(() => import("./window")).callThrough().with(mocks["./window"]);
            mock(() => import("./tray")).callThrough().with(mocks["./tray"]);
            mock(() => import("./web-content-context-menu")).with(mocks["./web-content-context-menu"]);
            mock(() => import("./app-update")).callThrough().with(mocks["./app-update"]);
            mock(() => import("./keytar")).with({
                getPassword: sinon.spy(),
                deletePassword: sinon.spy(),
                setPassword: sinon.spy(),
            });
            mock(() => import("electron-unhandled")).with(mocks["electron-unhandled"]);
            mock(() => import("electron")).with(mocks.electron as any);
        },
    );
});

function buildMocks(testContext: TestContext) {
    return {
        "~index": {
            "./session": {
                clearDefaultSessionCaches: sinon.stub().returns(Promise.resolve({})),
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
                    requestSingleInstanceLock: sinon.stub().returns(true),
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
