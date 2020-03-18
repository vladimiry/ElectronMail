import randomstring from "randomstring";
import sinon from "sinon";
import test, {ExecutionContext} from "ava";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {name: SERVICE} = require("package.json"); // tslint:disable-line: no-import-zones
const ACCOUNT = "master-password";

function buildMocks() { // eslint-disable-line @typescript-eslint/explicit-function-return-type
    const store = new Map<string, string>();

    return {
        keytar: {
            getPassword: sinon.stub().callsFake(
                ((async (service, account) => {
                    return store.get(JSON.stringify({service, account})) || null;
                    // tslint:disable-next-line:no-import-zones
                }) as (typeof import("keytar"))["getPassword"]) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            ),
            setPassword: sinon.stub().callsFake(
                ((async (service, account, password) => {
                    store.set(JSON.stringify({service, account}), password);
                    // tslint:disable-next-line:no-import-zones
                }) as (typeof import("keytar"))["setPassword"]) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            ),
            deletePassword: sinon.stub().callsFake(
                ((async (service, account) => {
                    return store.delete(JSON.stringify({service, account}));
                    // tslint:disable-next-line:no-import-zones
                }) as (typeof import("keytar"))["deletePassword"]) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            ),
        },
    };
}

async function loadLibrary(
    mocks: ReturnType<typeof buildMocks>,
): Promise<typeof  import("src/electron-main/keytar")> {
    const library = await import("src/electron-main/keytar");

    library.STATE.resolveKeytar = async (): ReturnType<typeof library.STATE.resolveKeytar> => {
        return mocks.keytar;
    };

    return library;
}

function testAlwaysCalledWith(
    t: ExecutionContext,
    {keytar}: ReturnType<typeof buildMocks>,
    data: { password: string },
): void {
    if (keytar.getPassword.called) {
        t.true(keytar.getPassword.alwaysCalledWith(SERVICE, ACCOUNT));
    }
    if (keytar.setPassword.called) {
        t.true(keytar.setPassword.alwaysCalledWith(SERVICE, ACCOUNT, data.password));
    }
    if (keytar.deletePassword.called) {
        t.true(keytar.deletePassword.alwaysCalledWith(SERVICE, ACCOUNT));
    }
}

test.serial("getPassword", async (t) => {
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);
    const password = randomstring.generate();

    t.is(mocks.keytar.getPassword.callCount, 0);
    t.falsy(await library.getPassword());
    await library.setPassword(password);
    t.is(await library.getPassword(), password);
    t.is(mocks.keytar.getPassword.callCount, 2);

    testAlwaysCalledWith(t, mocks, {password});
});

test.serial("setPassword", async (t) => {
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);
    const password = randomstring.generate();

    t.is(mocks.keytar.setPassword.callCount, 0);
    await library.setPassword(password);
    t.is(await library.getPassword(), password);
    t.is(mocks.keytar.setPassword.callCount, 1);

    testAlwaysCalledWith(t, mocks, {password});
});

test.serial("deletePassword", async (t) => {
    const mocks = buildMocks();
    const library = await loadLibrary(mocks);
    const password = randomstring.generate();

    await library.setPassword(password);
    t.is(await library.getPassword(), password);
    t.is(mocks.keytar.deletePassword.callCount, 0);
    t.true(await library.deletePassword());
    t.is(mocks.keytar.deletePassword.callCount, 1);
    t.falsy(await library.getPassword());
    t.not(password, await library.getPassword());

    testAlwaysCalledWith(t, mocks, {password});
});
