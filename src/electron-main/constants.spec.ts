import {test} from "ava";

import {KEYTAR_MASTER_PASSWORD_ACCOUNT, KEYTAR_SERVICE_NAME} from "./constants";

// tslint:disable-next-line:no-var-requires
const {name: packageName} = require("package.json");

test(`"keytar" constants`, async (t) => {
    t.truthy(KEYTAR_MASTER_PASSWORD_ACCOUNT);
    t.truthy(KEYTAR_SERVICE_NAME);
    t.truthy(packageName);
    t.is(packageName, KEYTAR_SERVICE_NAME);
});
