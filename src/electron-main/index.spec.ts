import anyTest, {TestInterface} from "ava";
import rewiremock from "rewiremock";
import sinon from "sinon";

import {APP_NAME} from "src/shared/constants";
import {Endpoints} from "src/shared/api/main";
import {INITIAL_STORES} from "./constants";

interface TestContext {
    ctx: any;
    endpoints: Pick<Endpoints, "readConfig">;
    mocks: ReturnType<typeof buildMocks>;
}

const test = anyTest as TestInterface<TestContext>;

test.serial("workflow", async (t) => {
    const m = t.context.mocks["~index"];

    t.true(m.electron.app.setAppUserModelId.calledWithExactly(`com.github.vladimiry.${APP_NAME}`));
    t.true(m["electron-unhandled"].calledWithExactly(sinon.match.hasOwn("logger")), `"electronUnhandled" called`);
    t.true(m[`./util`].initContext.calledWithExactly(), `"initContext" called`);
    t.true(m["./database"].connect.calledWithExactly(), `"connect" called`);
    t.true(m["./api"].initApi.calledWithExactly(t.context.ctx), `"initApi" called`);
    t.true(m.electron.app.makeSingleInstance.called, `"makeSingleInstance" called`);
    t.true(m["./window"].initBrowserWindow.calledWithExactly(t.context.ctx), `"initBrowserWindow" called`);
    t.true(m["./tray"].initTray.calledWithExactly(t.context.ctx, t.context.endpoints), `"initTray" called`);
    t.true(m["./web-content-context-menu"].initWebContentContextMenu.calledWithExactly(t.context.ctx), `initWebContentContextMenu called`);
    t.true(m["./app-update"].initAutoUpdate.calledWithExactly(), `"initAutoUpdate" called`);
});

test.beforeEach(async (t) => {
    t.context.endpoints = {
        readConfig: sinon.stub().returns({
            toPromise: () => Promise.resolve(INITIAL_STORES.config),
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
            mock(() => import("./database")).with(mocks["./database"]);
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
            "./database": {
                connect: sinon.stub().returns(Promise.resolve()),
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
