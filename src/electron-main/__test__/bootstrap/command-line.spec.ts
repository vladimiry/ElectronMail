// TODO drop eslint disabling
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {Fs, Store} from "fs-json-store";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";
import {PACKAGE_NAME, PACKAGE_VERSION} from "src/shared/constants";
import {generateElectronMainTestPrefixedFile} from "src/electron-main/__test__/util";

// TODO test "commandLineSwitches" config value applying cases

function buildMocks( // eslint-disable-line @typescript-eslint/explicit-function-return-type
    additionMocks?: Record<string, unknown>,
) {
    return {
        electron: {
            app: {
                commandLine: {
                    appendSwitch: sinon.spy(),
                },
                disableHardwareAcceleration: sinon.spy(),
                getName: (): string => PACKAGE_NAME,
                getVersion: (): string => PACKAGE_VERSION,
            },
        },
        ...additionMocks,
    };
}

function buildContext(
    fsImplPatch?: Partial<Store<Config>["fs"]["_impl"]>,
): Pick<Context, "configStore"> {
    const configStore = new Store<Config>({
        fs: Fs.Fs.volume(),
        file: generateElectronMainTestPrefixedFile("./config.json"),
    });

    if (fsImplPatch) {
        Object.assign(configStore.fs._impl, fsImplPatch);
    }

    return {
        configStore,
    };
}

async function loadLibrary(
    mocks: ReturnType<typeof buildMocks>,
): Promise<typeof import("src/electron-main/bootstrap/command-line")> {
    return rewiremock.around(
        async () => import("src/electron-main/bootstrap/command-line"),
        (mock) => {
            for (const [name, data] of Object.entries(mocks)) {
                mock(name).with(data);
            }
        },
    );
}

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: undefined config", async (t) => {
    const ctx = buildContext();
    const mocks = buildMocks({"src/electron-main/util": {readConfigSync: sinon.stub().returns(null)}});
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(
        ctx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", INITIAL_STORES.config().jsFlags.join(" ")));
});

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: js-flags:default", async (t) => {
    const ctx = buildContext();
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(
        ctx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    const expected = INITIAL_STORES.config().jsFlags.join(" ");
    t.truthy(expected);
    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", expected));
});

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: js-flags:undefined", async (t) => {
    const ctx = buildContext();
    const mocks = buildMocks({"src/electron-main/util": {readConfigSync: {}}});
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(
        ctx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", INITIAL_STORES.config().jsFlags.join(" ")));
});

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: js-flags:empty", async (t) => {
    const jsFlags: Exclude<Config["jsFlags"], undefined> = [];
    const ctx = buildContext({readFileSync: () => JSON.stringify({jsFlags})});
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(
        ctx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", ""));
});

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: js-flags:custom", async (t) => {
    const jsFlags: Exclude<Config["jsFlags"], undefined> = [
        "--some-val-1=111",
        "--some-val-2",
        "--some-val-3=333",
    ];
    const ctx = buildContext({readFileSync: () => JSON.stringify({jsFlags})});
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(
        ctx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", jsFlags.join(" ")));
});

test.serial("bootstrapCommandLine(): app.disableHardwareAcceleration() should not be called", async (t) => {
    const {disableGpuProcess}: Pick<Config, "disableGpuProcess"> = {disableGpuProcess: false};
    const ctx = buildContext({readFileSync: () => JSON.stringify({disableGpuProcess})});
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.disableHardwareAcceleration.called);
    library.bootstrapCommandLine(ctx as any);
    t.false(mocks.electron.app.disableHardwareAcceleration.called);
    t.true(mocks.electron.app.commandLine.appendSwitch.neverCalledWith("disable-software-rasterizer"));
});

test.serial("bootstrapCommandLine(): app.disableHardwareAcceleration() should be called", async (t) => {
    const {disableGpuProcess}: Pick<Config, "disableGpuProcess"> = {disableGpuProcess: true};
    const ctx = buildContext({readFileSync: () => JSON.stringify({disableGpuProcess})});
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.disableHardwareAcceleration.called);
    library.bootstrapCommandLine(ctx as any);
    t.true(mocks.electron.app.disableHardwareAcceleration.called);
    // t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("disable-software-rasterizer"));
});
