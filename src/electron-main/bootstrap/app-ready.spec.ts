import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {Fs, Store} from "fs-json-store";
import {of} from "rxjs";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {PACKAGE_NAME} from "src/shared/constants";

test.serial("appReadyHandler(): default", async (t) => {
    const ctx = buildContext();
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks["src/electron-main/session"].getDefaultSession.called);
    t.false(mocks["src/electron-main/session"].initSession.called);
    t.false(mocks["src/electron-main/api"].initApi.called);
    t.false(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers.called);
    t.false(mocks["src/electron-main/window/main"].initMainBrowserWindow.called);
    t.false(mocks["src/electron-main/tray"].initTray.called);
    t.false(mocks["src/electron-main/menu"].initApplicationMenu.called);
    t.false(mocks.electron.app.on.called);

    await library.appReadyHandler(ctx as any);

    const defaultSession = mocks["src/electron-main/session"].getDefaultSession.firstCall.returnValue;
    const endpoints = mocks["src/electron-main/api"].initApi.firstCall.returnValue;

    t.true(mocks["src/electron-main/session"].getDefaultSession.calledWithExactly());

    t.true(mocks["src/electron-main/session"].initSession.calledWithExactly(ctx, defaultSession));
    t.true(mocks["src/electron-main/session"].initSession.calledAfter(mocks["src/electron-main/session"].getDefaultSession));

    t.true(mocks["src/electron-main/api"].initApi.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/api"].initApi.calledAfter(mocks["src/electron-main/session"].initSession));

    t.true(endpoints.readConfig.calledWithExactly());
    t.true(endpoints.readConfig.calledAfter(mocks["src/electron-main/api"].initApi));

    t.true(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers.calledAfter(endpoints.readConfig));

    t.true(mocks["src/electron-main/window/main"].initMainBrowserWindow.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/window/main"].initMainBrowserWindow.calledAfter(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers)); // tslint:disable-line:max-line-length

    t.true(mocks["src/electron-main/tray"].initTray.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/tray"].initTray.calledAfter(mocks["src/electron-main/window/main"].initMainBrowserWindow));

    t.true(mocks["src/electron-main/menu"].initApplicationMenu.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/menu"].initApplicationMenu.calledAfter(mocks["src/electron-main/tray"].initTray));

    t.true(endpoints.updateOverlayIcon.calledWithExactly({hasLoggedOut: false, unread: 0}));
    t.true(endpoints.updateOverlayIcon.calledAfter(mocks["src/electron-main/menu"].initApplicationMenu));
    t.is(endpoints.updateOverlayIcon.callCount, 1);

    t.true(mocks.electron.app.on.calledWith("second-instance"));
    t.true(mocks.electron.app.on.calledWith("activate"));
    t.is(mocks.electron.app.on.callCount, 2);

    t.true(endpoints.activateBrowserWindow.calledWithExactly());
    t.true(endpoints.activateBrowserWindow.calledAfter(mocks.electron.app.on));
    t.is(endpoints.activateBrowserWindow.callCount, 2);
});

function buildMocks() {
    return {
        "electron": {
            app: {
                on: sinon.stub().callsArgWith(1, {}, {on: sinon.spy()}),
            },
        },
        "src/electron-main/session": {
            getDefaultSession: sinon.stub().returns({[`${PACKAGE_NAME}_session_id`]: 123}),
            initSession: sinon.spy(),
        },
        "src/electron-main/api": {
            initApi: sinon.stub().returns({
                readConfig: sinon.stub().returns(of(INITIAL_STORES.config())),
                updateOverlayIcon: sinon.stub().returns(of(null)),
                activateBrowserWindow: sinon.stub().returns(of(INITIAL_STORES.config())),
            }),
        },
        "src/electron-main/menu": {
            initApplicationMenu: sinon.spy(),
        },
        "src/electron-main/window/main": {
            initMainBrowserWindow: sinon.spy(),
        },
        "src/electron-main/tray": {
            initTray: sinon.spy(),
        },
        "src/electron-main/web-contents": {
            initWebContentsCreatingHandlers: sinon.spy(),
        },
    };
}

function buildContext(fsImplPatch?: Partial<Store<Config>["fs"]["_impl"]>): Pick<Context, "configStore"> {
    const memFsVolume = Fs.MemFs.volume();

    memFsVolume._impl.mkdirpSync(process.cwd());

    const configStore = new Store<Config>({
        fs: memFsVolume,
        file: "./config.json",
    });

    if (fsImplPatch) {
        Object.assign(configStore.fs._impl, fsImplPatch);
    }

    return {
        configStore,
    };
}

async function loadLibrary(mocks: ReturnType<typeof buildMocks>) {
    return await rewiremock.around(
        () => import("./app-ready"),
        (mock) => {
            for (const [name, data] of Object.entries(mocks)) {
                mock(name).with(data);
            }
        },
    );
}
