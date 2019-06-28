import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {Fs, Store} from "fs-json-store";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {INITIAL_STORES} from "src/electron-main/constants";

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: default", async (t) => {
    const ctx = buildContext();
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(ctx as any);

    const expected = INITIAL_STORES.config().jsFlags.join(" ");
    t.truthy(expected);
    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", expected));
});

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: empty", async (t) => {
    const jsFlags: Exclude<Config["jsFlags"], undefined> = [];
    const ctx = buildContext({readFileSync: () => JSON.stringify({jsFlags})});
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(ctx as any);

    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", ""));
});

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: custom", async (t) => {
    const jsFlags: Exclude<Config["jsFlags"], undefined> = [
        "--some-val-1=111",
        "--some-val-2",
        "--some-val-3=333",
    ];
    const ctx = buildContext({readFileSync: () => JSON.stringify({jsFlags})});
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);

    t.false(mocks.electron.app.commandLine.appendSwitch.called);

    library.bootstrapCommandLine(ctx as any);

    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", jsFlags.join(" ")));
});

function buildMocks() {
    return {
        electron: {
            app: {
                commandLine: {
                    appendSwitch: sinon.spy(),
                },
                disableHardwareAcceleration: sinon.spy(),
            },
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
    return rewiremock.around(
        () => import("./command-line"),
        (mock) => {
            for (const [name, data] of Object.entries(mocks)) {
                mock(name).with(data);
            }
        },
    );
}
