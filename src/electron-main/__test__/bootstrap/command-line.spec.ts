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

function buildMocks() { // eslint-disable-line @typescript-eslint/explicit-function-return-type
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
    };
}

function buildContext(
    fsImplPatch?: Partial<Store<Config>["fs"]["_impl"]>,
): Pick<Context, "configStore"> {
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

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: default", async (t) => {
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

test.serial("bootstrapCommandLine(): electron.app.commandLine.appendSwitch: empty", async (t) => {
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

    library.bootstrapCommandLine(
        ctx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    t.true(mocks.electron.app.commandLine.appendSwitch.calledWithExactly("js-flags", jsFlags.join(" ")));
});
