import test from "ava";

import {INITIAL_STORES} from "src/electron-main/constants";

test("INITIAL_STORES.config().logLevel", (t) => {
    t.is("error", INITIAL_STORES.config().logLevel);
});

test("INITIAL_STORES.settings().databaseEncryptionKey call should return random data", (t) => {
    const set: Set<string> = new Set();
    const expectedSize = 100;
    for (let i = 0; i < expectedSize; i++) {
        set.add(INITIAL_STORES.settings().databaseEncryptionKey);
    }
    t.is(expectedSize, set.size);
});

test("INITIAL_STORES.settings().sessionStorageEncryptionKey call should return random data", (t) => {
    const set: Set<string> = new Set();
    const expectedSize = 100;
    for (let i = 0; i < expectedSize; i++) {
        set.add(INITIAL_STORES.settings().sessionStorageEncryptionKey);
    }
    t.is(expectedSize, set.size);
});

test("INITIAL_STORES.settings().databaseEncryptionKey should be 32 bytes length base64 encoded string", (t) => {
    t.is(32, Buffer.from(INITIAL_STORES.settings().databaseEncryptionKey, "base64").length);
});

test("INITIAL_STORES.settings().sessionStorageEncryptionKey should be 32 bytes length base64 encoded string", (t) => {
    t.is(32, Buffer.from(INITIAL_STORES.settings().sessionStorageEncryptionKey, "base64").length);
});
