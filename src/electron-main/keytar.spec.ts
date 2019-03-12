import randomstring from "randomstring";
import sinon from "sinon";
import test, {ExecutionContext} from "ava";

const {name: SERVICE} = require("package.json"); // tslint:disable-line:no-var-requires no-import-zones
const ACCOUNT = "master-password";

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

function testAlwaysCalledWith(
    t: ExecutionContext,
    {keytar}: ReturnType<typeof buildMocks>,
    data: { password: string },
) {
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

function buildMocks() {
    const store = new Map<string, string>();

    return {
        keytar: {
            getPassword: sinon.stub().callsFake(
                ((async (service, account) => {
                    return store.get(JSON.stringify({service, account})) || null;
                }) as (typeof import("keytar"))["getPassword"]) as any, // tslint:disable-line:no-import-zones
            ),
            setPassword: sinon.stub().callsFake(
                ((async (service, account, password) => {
                    store.set(JSON.stringify({service, account}), password);
                }) as (typeof import("keytar"))["setPassword"]) as any, // tslint:disable-line:no-import-zones
            ),
            deletePassword: sinon.stub().callsFake(
                ((async (service, account) => {
                    return store.delete(JSON.stringify({service, account}));
                }) as (typeof import("keytar"))["deletePassword"]) as any, // tslint:disable-line:no-import-zones
            ),
        },
    };
}

async function loadLibrary(mocks: ReturnType<typeof buildMocks>) {
    const library = await import("./keytar");

    library.STATE.resolveKeytar = async () => {
        return mocks.keytar;
    };

    return library;
}
