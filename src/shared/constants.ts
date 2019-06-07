import {AccountType} from "src/shared/model/account";
import {EntryUrlItem, LogLevel} from "./model/common";

const {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    license: PACKAGE_LICENSE,
    description: PACKAGE_DESCRIPTION,
} = require("package.json"); // tslint:disable-line:no-var-requires no-import-zones

export const PRODUCT_NAME = "ElectronMail";

export const REPOSITORY_NAME = PRODUCT_NAME;

export const BINARY_NAME = PACKAGE_NAME;

export {
    PACKAGE_NAME,
    PACKAGE_VERSION,
    PACKAGE_LICENSE,
    PACKAGE_DESCRIPTION,
};

// user data dir, defaults to app.getPath("userData")
export const RUNTIME_ENV_USER_DATA_DIR = `ELECTRON_MAIL_USER_DATA_DIR`;

// boolean
export const RUNTIME_ENV_E2E = `ELECTRON_MAIL_E2E`;

export const ONE_SECOND_MS = 1000;

export const ONE_MINUTE_MS = ONE_SECOND_MS * 60;

export const DEFAULT_API_CALL_TIMEOUT = ONE_SECOND_MS * 25;

export const DEFAULT_UNREAD_BADGE_BG_COLOR = "#de4251";

export const DEFAULT_UNREAD_BADGE_BG_TEXT = "#ffffff";

export const DEFAULT_MESSAGES_STORE_PORTION_SIZE = 500;

export const APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR = "./usr/share/hunspell";

export const PROVIDER_REPO: Record<AccountType, { repo: string, version: string; commit: string; }> = {
    protonmail: {
        repo: "https://github.com/ProtonMail/WebClient.git",
        commit: "80ecc1a4e0843089d93a822b53a1651a7e6825f7",
        version: "3.15.38",
    },
    tutanota: {
        repo: "https://github.com/tutao/tutanota.git",
        commit: "cc83809313787d5192f82203f24c81af4f01414e",
        version: "3.52.1",
    },
};

export const LOCAL_WEBCLIENT_PROTOCOL_PREFIX = "webclient";
export const LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}[\\d]+`;

export const ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX = "local:::";
export const ACCOUNTS_CONFIG: Record<AccountType, Record<"entryUrl", EntryUrlItem[]>> = {
    protonmail: {
        entryUrl: [
            {
                value: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://mail.protonmail.com`,
                title: `https://mail.protonmail.com (${getBuiltInWebClientTitle("protonmail")})`,
            },
            {
                value: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://app.protonmail.ch`,
                title: `https://app.protonmail.ch (${getBuiltInWebClientTitle("protonmail")})`,
            },
            {
                value: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://protonirockerxow.onion`,
                title: `https://protonirockerxow.onion (${getBuiltInWebClientTitle("protonmail")})`,
            },
            {
                value: "https://beta.protonmail.com",
                title: "https://beta.protonmail.com (deprecated)",
            },
        ],
    },
    tutanota: {
        entryUrl: [
            {
                value: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://mail.tutanota.com`,
                title: `https://mail.tutanota.com (${getBuiltInWebClientTitle("tutanota")})`,
            },
        ],
    },
};

function getBuiltInWebClientTitle(accountType: AccountType): string {
    return `v${PROVIDER_REPO[accountType].version}-${PROVIDER_REPO[accountType].commit.substr(0, 7)}`;
}

export const LOG_LEVELS: LogLevel[] = Object.keys(((stub: Record<LogLevel, null>) => stub)({
    error: null,
    warn: null,
    info: null,
    verbose: null,
    debug: null,
    silly: null,
})) as LogLevel[];
