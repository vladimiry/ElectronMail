import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";

import {PACKAGE_NAME} from "src/shared/constants";

test.serial("flow", async (t) => {
    const mocks = buildMocks();

    await loadLibrary(mocks);

    const ctx = mocks["./util"].initContext.firstCall.returnValue;

    t.truthy(ctx);

    t.true(mocks["./bootstrap/init"].bootstrapInit.alwaysCalledWithExactly());
    t.is(mocks["./bootstrap/init"].bootstrapInit.callCount, 1);

    t.true(mocks["./util"].initContext.alwaysCalledWithExactly());
    t.true(mocks["./util"].initContext.calledAfter(mocks["./bootstrap/init"].bootstrapInit));
    t.is(mocks["./util"].initContext.callCount, 1);

    t.true(mocks["./bootstrap/command-line"].bootstrapCommandLine.alwaysCalledWithExactly(ctx));
    t.true(mocks["./bootstrap/command-line"].bootstrapCommandLine.calledAfter(mocks["./util"].initContext));
    t.is(mocks["./bootstrap/command-line"].bootstrapCommandLine.callCount, 1);

    t.true(mocks["./protocol"].registerStandardSchemes.alwaysCalledWithExactly(ctx));
    t.true(mocks["./protocol"].registerStandardSchemes.calledAfter(mocks["./bootstrap/command-line"].bootstrapCommandLine));
    t.is(mocks["./protocol"].registerStandardSchemes.callCount, 1);

    t.true(mocks.electron.app.on.alwaysCalledWith("ready"));
    t.true(mocks.electron.app.on.calledAfter(mocks["./protocol"].registerStandardSchemes));
    t.is(mocks.electron.app.on.callCount, 1);

    t.true(mocks["./bootstrap/app-ready"].appReadyHandler.alwaysCalledWithExactly(ctx));
    t.true(mocks["./bootstrap/app-ready"].appReadyHandler.calledAfter(mocks.electron.app.on));
    t.is(mocks["./bootstrap/app-ready"].appReadyHandler.callCount, 1);
});

function buildMocks() {
    return {
        "electron": {
            app: {
                on: sinon.stub().callsArgWith(1, {}, {on: sinon.spy()}),
            },
        },
        "./bootstrap/app-ready": {
            appReadyHandler: sinon.spy(),
        },
        "./bootstrap/command-line": {
            bootstrapCommandLine: sinon.spy(),
        },
        "./bootstrap/init": {
            bootstrapInit: sinon.spy(),
        },
        "./util": {
            initContext: sinon.stub().returns({[`${PACKAGE_NAME}_context_id`]: 123}),
        },
        "./protocol": {
            registerStandardSchemes: sinon.spy(),
        },
    };
}

async function loadLibrary(mocks: ReturnType<typeof buildMocks>) {
    return await rewiremock.around(
        () => import("./index"),
        (mock) => {
            for (const [name, data] of Object.entries(mocks)) {
                mock(name).with(data);
            }
        },
    );
}
