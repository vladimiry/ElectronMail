import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {Fs, Store} from "fs-json-store";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {PACKAGE_NAME} from "src/shared/constants";

test.serial("appReadyHandler(): default", async (t) => {
    const {spellCheckLocale}: Pick<Config, "spellCheckLocale"> = {spellCheckLocale: `en_US_${Date.now()}`};
    const ctx = buildContext();
    const mocks = buildMocks({spellCheckLocale});
    const library = await loadLibrary(mocks);

    t.false(mocks["src/electron-main/session"].getDefaultSession.called);
    t.false(mocks["src/electron-main/session"].initSession.called);
    t.false(mocks["src/electron-main/api"].initApi.called);
    t.false(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers.called);
    t.false(mocks["src/electron-main/window/main"].initMainBrowserWindow.called);
    t.false(mocks["src/electron-main/tray"].initTray.called);
    t.false(mocks["src/electron-main/menu"].initApplicationMenu.called);
    t.false(mocks["src/electron-main/spell-check/controller"].initSpellCheckController.called);
    t.false(mocks.electron.app.on.called);

    await library.appReadyHandler(ctx as any);

    const defaultSession = mocks["src/electron-main/session"].getDefaultSession.firstCall.returnValue;
    const endpoints = mocks["src/electron-main/api"].initApi.firstCall.returnValue;

    t.true(mocks["src/electron-main/session"].getDefaultSession.calledWithExactly());

    t.true(mocks["src/electron-main/protocol"].registerWebFolderFileProtocol.calledWithExactly(ctx, defaultSession));
    t.true(mocks["src/electron-main/protocol"].registerWebFolderFileProtocol.calledAfter(
        mocks["src/electron-main/session"].getDefaultSession),
    );

    t.true(mocks["src/electron-main/session"].initSession.calledWithExactly(ctx, defaultSession));
    t.true(mocks["src/electron-main/session"].initSession.calledAfter(mocks["src/electron-main/protocol"].registerWebFolderFileProtocol));

    t.true(mocks["src/electron-main/api"].initApi.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/api"].initApi.calledAfter(mocks["src/electron-main/session"].initSession));

    t.true(endpoints.readConfig.calledWithExactly());
    t.true(endpoints.readConfig.calledAfter(mocks["src/electron-main/api"].initApi));

    t.true(mocks["src/electron-main/spell-check/controller"].initSpellCheckController.calledWithExactly(spellCheckLocale));
    t.true(mocks["src/electron-main/spell-check/controller"].initSpellCheckController.calledAfter(endpoints.readConfig));

    t.true(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers.calledAfter(mocks["src/electron-main/spell-check/controller"].initSpellCheckController)); // tslint:disable-line:max-line-length

    t.true(mocks["src/electron-main/window/main"].initMainBrowserWindow.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/window/main"].initMainBrowserWindow.calledAfter(mocks["src/electron-main/web-contents"].initWebContentsCreatingHandlers)); // tslint:disable-line:max-line-length

    t.true(mocks["src/electron-main/tray"].initTray.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/tray"].initTray.calledAfter(mocks["src/electron-main/window/main"].initMainBrowserWindow));

    t.true(mocks["src/electron-main/menu"].initApplicationMenu.calledWithExactly(ctx));
    t.true(mocks["src/electron-main/menu"].initApplicationMenu.calledAfter(mocks["src/electron-main/tray"].initTray));

    t.true(endpoints.updateOverlayIcon.calledWithExactly({hasLoggedOut: false, unread: 0, trayIconColor: ""}));
    t.true(endpoints.updateOverlayIcon.calledAfter(mocks["src/electron-main/menu"].initApplicationMenu));
    t.is(endpoints.updateOverlayIcon.callCount, 1);

    t.true(mocks.electron.app.on.calledWith("second-instance"));
    t.true(mocks.electron.app.on.calledWith("activate"));
    t.is(mocks.electron.app.on.callCount, 2);

    t.true(endpoints.activateBrowserWindow.calledWithExactly());
    t.true(endpoints.activateBrowserWindow.calledAfter(mocks.electron.app.on));
    t.is(endpoints.activateBrowserWindow.callCount, 2);
});

function buildMocks(configPatch?: Partial<Config>) {
    const config = INITIAL_STORES.config();

    if (configPatch) {
        Object.assign(config, configPatch);
    }

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
        "src/electron-main/protocol": {
            registerWebFolderFileProtocol: sinon.spy(),
        },
        "src/electron-main/api": {
            initApi: sinon.stub().returns({
                readConfig: sinon.stub().returns(Promise.resolve(config)),
                updateOverlayIcon: sinon.stub().returns(Promise.resolve()),
                activateBrowserWindow: sinon.stub().returns(Promise.resolve()),
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
        "src/electron-main/spell-check/controller": {
            initSpellCheckController: sinon.spy(),
        },
        "src/electron-main/web-contents": {
            initWebContentsCreatingHandlers: sinon.spy(),
        },
    };
}

function buildContext(): Pick<Context, "configStore"> {
    const memFsVolume = Fs.MemFs.volume();

    memFsVolume._impl.mkdirpSync(process.cwd());

    const configStore = new Store<Config>({
        fs: memFsVolume,
        file: "./config.json",
    });

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
