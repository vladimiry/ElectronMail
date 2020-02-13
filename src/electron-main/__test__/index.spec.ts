import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";

import {INITIAL_STORES} from "src/electron-main/constants";
import {ONE_SECOND_MS, PACKAGE_NAME, PACKAGE_VERSION} from "src/shared/constants";
import {asyncDelay} from "src/shared/util";

test("flow", async (t) => {
    const mocks = buildMocks();

    await Promise.all([
        await loadLibrary(mocks),
        asyncDelay(ONE_SECOND_MS / 2),
    ]);

    const ctx = mocks["./context"].initContext.firstCall.returnValue;

    t.truthy(ctx);

    t.true(mocks["./bootstrap/init"].bootstrapInit.alwaysCalledWithExactly());
    t.is(mocks["./bootstrap/init"].bootstrapInit.callCount, 1);

    t.true(mocks["./context"].initContext.alwaysCalledWithExactly());
    t.true(mocks["./context"].initContext.calledAfter(mocks["./bootstrap/init"].bootstrapInit));
    t.is(mocks["./context"].initContext.callCount, 1);

    t.true(mocks["./bootstrap/command-line"].bootstrapCommandLine.alwaysCalledWithExactly(ctx));
    t.true(mocks["./bootstrap/command-line"].bootstrapCommandLine.calledAfter(mocks["./context"].initContext));
    t.is(mocks["./bootstrap/command-line"].bootstrapCommandLine.callCount, 1);

    t.true(mocks["./protocol"].registerStandardSchemes.alwaysCalledWithExactly(ctx));
    t.true(mocks["./protocol"].registerStandardSchemes.calledAfter(mocks["./bootstrap/command-line"].bootstrapCommandLine));
    t.is(mocks["./protocol"].registerStandardSchemes.callCount, 1);

    t.true(mocks["./bootstrap/upgrade-config"].upgradeExistingConfig.alwaysCalledWithExactly(ctx));
    t.true(mocks["./bootstrap/upgrade-config"].upgradeExistingConfig.calledAfter(mocks["./protocol"].registerStandardSchemes));
    t.is(mocks["./bootstrap/upgrade-config"].upgradeExistingConfig.callCount, 1);

    t.true(mocks.electron.app.whenReady.calledAfter(mocks["./bootstrap/upgrade-config"].upgradeExistingConfig));
    t.is(mocks.electron.app.whenReady.callCount, 1);

    t.is(mocks["./bootstrap/app-ready"].appReadyHandler.callCount, 1);
    t.true(mocks["./bootstrap/app-ready"].appReadyHandler.alwaysCalledWithExactly(ctx));
    t.true(mocks["./bootstrap/app-ready"].appReadyHandler.calledAfter(mocks.electron.app.whenReady));
});

function buildMocks() {
    return {
        "electron": {
            app: {
                whenReady: sinon.stub().returns(Promise.resolve()),
                getName: () => PACKAGE_NAME,
                getVersion: () => PACKAGE_VERSION,
            },
        },
        "./bootstrap/app-ready": {
            appReadyHandler: sinon.stub().returns(Promise.resolve()),
        },
        "./bootstrap/upgrade-config": {
            upgradeExistingConfig: sinon.stub().returns(Promise.resolve()),
        },
        "./bootstrap/command-line": {
            bootstrapCommandLine: sinon.spy(),
        },
        "./bootstrap/init": {
            bootstrapInit: sinon.spy(),
        },
        "./context": {
            initContext: sinon.stub().returns({
                [`${PACKAGE_NAME}_context_id`]: 123,
                configStore: {
                    async read() {
                        return INITIAL_STORES.config();
                    },
                },
            }),
        },
        "./protocol": {
            registerStandardSchemes: sinon.spy(),
        },
    };
}

async function loadLibrary(mocks: ReturnType<typeof buildMocks>) {
    return await rewiremock.around(
        () => import("src/electron-main/index"),
        (mock) => {
            for (const [name, data] of Object.entries(mocks)) {
                mock(name).with(data);
            }
        },
    );
}
