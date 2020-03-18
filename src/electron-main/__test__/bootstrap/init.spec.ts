import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";

import {PRODUCT_NAME, REPOSITORY_NAME} from "src/shared/constants";

function buildMocks( // eslint-disable-line @typescript-eslint/explicit-function-return-type
    arg: {
        requestSingleInstanceLockResult: boolean;
    },
) {
    return {
        "electron": {
            app: {
                exit: sinon.spy(),
                requestSingleInstanceLock: sinon.stub().returns(arg.requestSingleInstanceLockResult),
                setAppUserModelId: sinon.spy(),
            },
        },
        "electron-log": {
            error: sinon.spy(),
        },
        "electron-unhandled": sinon.spy(),
    };
}

async function loadLibrary(
    mocks: ReturnType<typeof buildMocks>,
): Promise<typeof import("src/electron-main/bootstrap/init")> {
    return rewiremock.around(
        async () => import("src/electron-main/bootstrap/init"),
        (mock) => {
            for (const [name, data] of Object.entries(mocks)) {
                mock(name).with(data);
            }
        },
    );
}

test.serial("bootstrapInit(): default", async (t) => {
    const mocks = buildMocks({requestSingleInstanceLockResult: false});
    const library = await loadLibrary(mocks);

    t.false(mocks["electron-unhandled"].called);
    t.false(mocks.electron.app.setAppUserModelId.called);
    t.false(mocks.electron.app.requestSingleInstanceLock.called);
    t.false(mocks.electron.app.exit.called);

    library.bootstrapInit();

    t.true(mocks["electron-unhandled"].calledWithExactly({
        logger: mocks["electron-log"].error,
        showDialog: true,
    }));

    ((): void => {
        const expectedAppId = "github.com/vladimiry/ElectronMail";
        t.is(`github.com/vladimiry/${PRODUCT_NAME}`, expectedAppId);
        t.is(`github.com/vladimiry/${REPOSITORY_NAME}`, expectedAppId);
        t.true(mocks.electron.app.setAppUserModelId.calledWithExactly(expectedAppId));
        t.true(mocks.electron.app.setAppUserModelId.calledAfter(mocks["electron-unhandled"]));
    })();

    t.true(mocks.electron.app.requestSingleInstanceLock.calledWithExactly());
    t.true(mocks.electron.app.requestSingleInstanceLock.calledAfter(mocks.electron.app.setAppUserModelId));

    t.true(mocks.electron.app.exit.calledWithExactly());
    t.true(mocks.electron.app.exit.calledAfter(mocks.electron.app.requestSingleInstanceLock));
});

test.serial("bootstrapInit: app.exit() should not be called", async (t) => {
    const mocks = buildMocks({requestSingleInstanceLockResult: true});
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.exit.called);
    library.bootstrapInit();
    t.false(mocks.electron.app.exit.called);
});
