import sinon from "sinon";
import rewiremock from "rewiremock";
import anyTest, {TestInterface} from "ava";

import {INITIAL_STORES} from "./constants";

const test = anyTest as TestInterface<{
    endpoints: any;
    ctx: any;
    mocks: any;
    mocked: any;
}>;

test.serial("workflow", async (t) => {
    const spies = t.context.mocks["~index"];

    t.true(spies.electron.app.setAppUserModelId.calledWithExactly("com.github.vladimiry.email-securely-app"));
    t.true(spies["electron-unhandled"].calledWithExactly(sinon.match.hasOwn("logger")), `"electronUnhandled" called`);
    t.true(spies[`./util`].initContext.calledWithExactly(), `"initContext" called`);
    t.true(spies.electron.app.makeSingleInstance.called, `"makeSingleInstance" called`);
    t.true(spies["./window"].initBrowserWindow.calledWithExactly(t.context.ctx), `"initBrowserWindow" called`);
    t.true(spies["./tray"].initTray.calledWithExactly(t.context.ctx, t.context.endpoints), `"initTray" called`);
    // tslint:disable-next-line:max-line-length
    t.true(spies["./web-content-context-menu"].initWebContentContextMenu.calledWithExactly(t.context.ctx), `initWebContentContextMenu called`);
    t.true(spies["./app-update"].initAutoUpdate.calledWithExactly(), `"initAutoUpdate" called`);
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

    t.context.mocks = {
        "~index": {
            "./util": {
                initContext: sinon.stub().resolves(t.context.ctx),
                activateBrowserWindow: sinon.spy(),
            },
            "./ipc-main-api": {
                initEndpoints: sinon.stub().returns(t.context.endpoints),
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

    t.context.mocked = {
        index: await rewiremock.around(
            () => import("./index"),
            (mock) => {
                const mocks = t.context.mocks["~index"];

                mock(() => import("./util"))
                    .callThrough()
                    .with(mocks["./util"]);
                mock(() => import("./ipc-main-api"))
                    .callThrough()
                    .with(mocks["./ipc-main-api"]);
                mock("./window")
                    .with(mocks["./window"]);
                mock("./tray")
                    .with(mocks["./tray"]);
                mock("./web-content-context-menu")
                    .with(mocks["./web-content-context-menu"]);
                mock("./app-update")
                    .with(mocks["./app-update"]);
                mock("keytar")
                    .with({
                        getPassword: sinon.spy(),
                        deletePassword: sinon.spy(),
                        setPassword: sinon.spy(),
                    });
                mock("electron-unhandled")
                    .with(mocks["electron-unhandled"]);
                mock("electron")
                    .with(mocks.electron);
            },
        ),
    };
});
