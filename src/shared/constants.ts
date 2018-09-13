import {LogLevel} from "electron-log";

import {AccountType} from "src/shared/model/account";
import {EntryUrlItem} from "./types";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: APP_NAME, version: APP_VERSION} = require("package.json");

export {
    APP_NAME,
    APP_VERSION,
};

// user data dir, defaults to app.getPath("userData")
export const RUNTIME_ENV_USER_DATA_DIR = `EMAIL_SECURELY_APP_USER_DATA_DIR`;

// boolean
export const RUNTIME_ENV_E2E = `EMAIL_SECURELY_APP_E2E`;

export const ONE_SECOND_MS = 1000;

export const ACCOUNTS_CONFIG: Record<AccountType, Record<"entryUrl", EntryUrlItem[]>> = {
    protonmail: {
        entryUrl: [
            {value: "https://app.protonmail.ch", title: "https://app.protonmail.ch"},
            {value: "https://mail.protonmail.com", title: "https://mail.protonmail.com"},
            {value: "https://beta.protonmail.com", title: "https://beta.protonmail.com (Beta)"},
            {value: "https://protonirockerxow.onion", title: "https://protonirockerxow.onion (Tor)"},
        ],
    },
    tutanota: {
        entryUrl: [
            {value: "https://mail.tutanota.com", title: "https://mail.tutanota.com"},
        ],
    },
};

export const WEBVIEW_SRC_WHITELIST: string[] = Object
    .entries(ACCOUNTS_CONFIG)
    .reduce((list, [accountType, {entryUrl}]) => list.concat(entryUrl), [] as EntryUrlItem[])
    .map(({value}) => value);

export const LOG_LEVELS: LogLevel[] = Object.keys(((stub: Record<LogLevel, null>) => stub)({
    error: null,
    warn: null,
    info: null,
    verbose: null,
    debug: null,
    silly: null,
})) as LogLevel[];
