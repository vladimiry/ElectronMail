import randomstring from "randomstring";
import rewiremock from "rewiremock";
import sinon from "sinon";
import test, {ExecutionContext} from "ava";

import {Unpacked} from "src/shared/types";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: SERVICE} = require("package.json");
const ACCOUNT = "master-password";

test.serial("getPassword", async (t) => {
    const {keytarModuleMocks, getPassword, setPassword} = await bootstrap();
    const password = randomstring.generate();

    t.is(0, keytarModuleMocks.getPassword.callCount);
    t.falsy(await getPassword());
    await setPassword(password);
    t.is(password, await getPassword());
    t.is(2, keytarModuleMocks.getPassword.callCount);

    testAlwaysCalledWith(t, keytarModuleMocks, {password});
});

test.serial("setPassword", async (t) => {
    const {keytarModuleMocks, getPassword, setPassword} = await bootstrap();
    const password = randomstring.generate();

    t.is(0, keytarModuleMocks.setPassword.callCount);
    await setPassword(password);
    t.is(password, await getPassword());
    t.is(1, keytarModuleMocks.setPassword.callCount);

    testAlwaysCalledWith(t, keytarModuleMocks, {password});
});

test.serial("deletePassword", async (t) => {
    const {keytarModuleMocks, getPassword, setPassword, deletePassword} = await bootstrap();
    const password = randomstring.generate();

    await setPassword(password);
    t.is(password, await getPassword());
    t.is(0, keytarModuleMocks.deletePassword.callCount);
    t.true(await deletePassword());
    t.is(1, keytarModuleMocks.deletePassword.callCount);
    t.falsy(await getPassword());
    t.not(password, await getPassword());

    testAlwaysCalledWith(t, keytarModuleMocks, {password});
});

function testAlwaysCalledWith(
    t: ExecutionContext,
    {getPassword, setPassword, deletePassword}: Unpacked<ReturnType<typeof bootstrap>>["keytarModuleMocks"],
    data: { password: string },
) {
    if (getPassword.called) {
        t.true(getPassword.alwaysCalledWith(SERVICE, ACCOUNT));
    }
    if (setPassword.called) {
        t.true(setPassword.alwaysCalledWith(SERVICE, ACCOUNT, data.password));
    }
    if (deletePassword.called) {
        t.true(deletePassword.alwaysCalledWith(SERVICE, ACCOUNT));
    }
}

async function bootstrap() {
    const store = new Map<string, string>();
    const keytarModuleMocks = {
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
    };
    const result = {
        ...(await rewiremock.around(
            () => import("./keytar"),
            // (mock) => {
            //     // tslint:disable-next-line:no-import-zones
            //     mock(() => import("keytar"))
            //         .with(keytarModuleMocks)
            //         .dynamic();
            // },
        )),
        keytarModuleMocks,
    };

    result.STATE.resolveKeytar = async () => {
        return keytarModuleMocks;
    };

    return result;
}
