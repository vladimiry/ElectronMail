import * as sinon from "sinon";
import rewiremock from "rewiremock";
import anyTest, {TestInterface} from "ava";

import {IpcMainActions} from "_shared/electron-actions";
import {INITIAL_STORES} from "./constants";

const test = anyTest as TestInterface<{
    endpoints: any;
    ctx: any;
    mocks: any;
    mocked: any;
}>;

test.serial("workflow", async (t) => {
    const mocks = t.context.mocks["~index"];
    const electronUnhandledSpy: sinon.SinonSpy = mocks["electron-unhandled"];
    const makeSingleInstanceSpy: sinon.SinonSpy = mocks.electron.app.makeSingleInstance;
    const initBrowserWindowSpy: sinon.SinonSpy = mocks["./window"].initBrowserWindow;
    const initTraySpy: sinon.SinonSpy = mocks["./tray"].initTray;
    const initWebContentContextMenuSpy: sinon.SinonSpy = mocks["./web-content-context-menu"].initWebContentContextMenu;
    const initAutoUpdateSpy: sinon.SinonSpy = mocks["./app-update"].initAutoUpdate;

    t.true(electronUnhandledSpy.calledWithExactly(sinon.match.hasOwn("logger")), `"electronUnhandled" called`);
    t.true(mocks[`./util`].initContext.calledWithExactly(), `"initContext" called`);
    t.true(makeSingleInstanceSpy.called, `"makeSingleInstance" called`);
    t.true(initBrowserWindowSpy.calledWithExactly(t.context.ctx), `"initBrowserWindow" called`);
    t.true(initTraySpy.calledWithExactly(t.context.ctx, t.context.endpoints), `"initTray" called`);
    t.true(initWebContentContextMenuSpy.calledWithExactly(t.context.ctx), `"initWebContentContextMenu" called`);
    t.true(initAutoUpdateSpy.calledWithExactly(), `"initAutoUpdate" called`);
});

test.beforeEach(async (t) => {
    t.context.endpoints = {
        [IpcMainActions.ReadConfig.channel]: {
            process: sinon.stub().returns(INITIAL_STORES.config),
        },
    };

    t.context.ctx = {
        on: sinon.spy(),
    };

    t.context.mocks = {
        "~index": {
            "./util": {
                initContext: sinon.stub().resolves(t.context.ctx),
                activateBrowserWindow: sinon.spy(),
                ipcMainOn: sinon.spy(),
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
