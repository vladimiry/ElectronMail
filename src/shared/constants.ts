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

export const PROVIDER_REPO: Record<Extract<AccountType, "protonmail">, { repo: string, version: string; commit: string; }> = {
    protonmail: {
        repo: "https://github.com/ProtonMail/WebClient.git",
        commit: "9b224b2ac01f9d4258979674d9151bc42677a8b9",
        version: "3.15.3",
    },
};

export const LOCAL_WEBCLIENT_PROTOCOL_PREFIX = "webclient";
export const LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}[\\d]+`;

export const ACCOUNTS_CONFIG_ENTRY_URL_SEPARATOR = ":::";
export const ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX = "local";
export const ACCOUNTS_CONFIG: Record<AccountType, Record<"entryUrl", EntryUrlItem[]>> = {
    protonmail: {
        entryUrl: [
            {
                value: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}${ACCOUNTS_CONFIG_ENTRY_URL_SEPARATOR}https://mail.protonmail.com`,
                title: `https://mail.protonmail.com (Built-in WebClient v${PROVIDER_REPO.protonmail.version})`,
            },
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

export const LOG_LEVELS: LogLevel[] = Object.keys(((stub: Record<LogLevel, null>) => stub)({
    error: null,
    warn: null,
    info: null,
    verbose: null,
    debug: null,
    silly: null,
})) as LogLevel[];
