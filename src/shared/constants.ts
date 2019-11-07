import {AccountType} from "src/shared/model/account";
import {EntryUrlItem, LogLevel} from "./model/common";

const {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    license: PACKAGE_LICENSE,
    description: PACKAGE_DESCRIPTION,
}: {
    name: string;
    version: string;
    license: string;
    description: string;
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

export const DEFAULT_TRAY_ICON_COLOR = "#1ca48c"; // src/assets/icon/icon.png dominant color

export const DEFAULT_UNREAD_BADGE_BG_COLOR = "#de4251";

export const DEFAULT_UNREAD_BADGE_BG_TEXT = "#ffffff";

export const DEFAULT_MESSAGES_STORE_PORTION_SIZE = 500;

export const APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR = "./usr/share/hunspell";

export const UPDATE_CHECK_FETCH_TIMEOUT = ONE_SECOND_MS * 10;

export const WEB_CHUNK_NAMES = {
    "about": "about",
    "browser-window": "browser-window",
    "search-in-page-browser-view": "search-in-page-browser-view",
} as const;

export const PROVIDER_REPO: Record<AccountType, { repo: string, version: string; commit: string; }> = {
    protonmail: {
        repo: "https://github.com/ProtonMail/WebClient.git",
        commit: "2e25f65bf874a67b033857f8f726fc640e2e1035",
        version: "3.16.6",
    },
    tutanota: {
        repo: "https://github.com/tutao/tutanota.git",
        commit: "d401796a2cdd459df32b7c42f414156de4c15d3a",
        version: "3.60.11",
    },
};

export const LOCAL_WEBCLIENT_PROTOCOL_PREFIX = "webclient";

export const LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}[\\d]+`;

export const ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX = "local:::";

export const PROTONMAIL_PRIMARY_ENTRY_POINT_VALUE = `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://mail.protonmail.com`;

export const ACCOUNTS_CONFIG: Record<AccountType, Record<"entryUrl", EntryUrlItem[]>> = {
    protonmail: {
        entryUrl: [
            {
                value: PROTONMAIL_PRIMARY_ENTRY_POINT_VALUE,
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
    return `v${PROVIDER_REPO[accountType].version} / ${PROVIDER_REPO[accountType].commit.substr(0, 7)}`;
}

export const LOG_LEVELS: Readonly<LogLevel[]> = Object.keys(
    ((stub: Record<LogLevel, null>) => {
        return stub;
    })({
        error: null,
        warn: null,
        info: null,
        verbose: null,
        debug: null,
        silly: null,
    }),
) as Readonly<LogLevel[]>;
