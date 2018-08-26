import test from "ava";

import {INITIAL_STORES, KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: APP_NAME} = require("package.json");

test("keytar constants", (t) => {
    t.is("master-password", KEYTAR_MASTER_PASSWORD_ACCOUNT);
    t.truthy(APP_NAME);
    t.truthy(KEYTAR_SERVICE_NAME);
    t.is(APP_NAME, KEYTAR_SERVICE_NAME, "name as in package.json");
});

test("INITIAL_STORES.config().logLevel", (t) => {
    t.is("error", INITIAL_STORES.config().logLevel);
});

test("INITIAL_STORES.settings().dbEncryptionKey call should return random data", (t) => {
    const set: Set<string> = new Set();
    const expectedSize = 100;
    for (let i = 0; i < expectedSize; i++) {
        set.add(INITIAL_STORES.settings().dbEncryptionKey);
    }
    t.is(expectedSize, set.size);
});

test("INITIAL_STORES.settings().dbEncryptionKey should be 32 bytes length base64 encoded string", (t) => {
    t.is(32, Buffer.from(INITIAL_STORES.settings().dbEncryptionKey, "base64").length);
});
