import {test} from "ava";

import {INITIAL_STORES, KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: APP_NAME, version: APP_VERSION} = require("package.json");

test("keytar constants", async (t) => {
    t.is("master-password", KEYTAR_MASTER_PASSWORD_ACCOUNT);
    t.truthy(APP_NAME);
    t.truthy(KEYTAR_SERVICE_NAME);
    t.is(APP_NAME, KEYTAR_SERVICE_NAME, "name as in package.json");
});

test("initialStore.config.version", async (t) => {
    t.truthy(APP_VERSION);
    t.truthy(INITIAL_STORES.config.appVersion);
    t.is(APP_VERSION, INITIAL_STORES.config.appVersion, "version as in package.json");
});
