import {EntryUrlItem, LogLevel} from "./model/common";
import {
    description as PACKAGE_DESCRIPTION,
    homepage as PACKAGE_GITHUB_PROJECT_URL,
    license as PACKAGE_LICENSE,
    name as PACKAGE_NAME,
    version as PACKAGE_VERSION,
} from "package.json";
import {PROTON_SHARED_MESSAGE_INTERFACE, PROVIDER_REPO_MAP} from "src/shared/proton-apps-constants";

export const PRODUCT_NAME = "ElectronMail";

export const REPOSITORY_NAME = PRODUCT_NAME;

export const BINARY_NAME = PACKAGE_NAME;

export {
    PACKAGE_NAME,
    PACKAGE_VERSION,
    PACKAGE_LICENSE,
    PACKAGE_DESCRIPTION,
    PACKAGE_GITHUB_PROJECT_URL,
};

export const ONE_SECOND_MS = 1000;

export const ONE_MINUTE_MS = ONE_SECOND_MS * 60;

export const DEFAULT_API_CALL_TIMEOUT = ONE_SECOND_MS * 25;

export const DEFAULT_TRAY_ICON_COLOR = "#1ca48c"; // src/assets/icon/icon.png dominant color

export const DEFAULT_UNREAD_BADGE_BG_COLOR = "#de4251";

export const DEFAULT_UNREAD_BADGE_BG_TEXT = "#ffffff";

export const DEFAULT_MESSAGES_STORE_PORTION_SIZE = 500;

export const APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR = "./usr/share/hunspell";

export const UPDATE_CHECK_FETCH_TIMEOUT = ONE_SECOND_MS * 10;

export const PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION = {
    // TODO "electron-builder" doesn't pack the resources with "node_modules" folder in the path, so renamed to "node_modules_" for now
    system:
        "./assets/db-search-monaco-editor/node_modules_/typescript/lib/lib.esnext.d.ts",
    protonMessage:
        `./assets/db-search-monaco-editor/proton-shared/${PROTON_SHARED_MESSAGE_INTERFACE.projectRelativeFile.replace(".ts", ".d.ts")}`,
} as const;

export const LOCAL_WEBCLIENT_PROTOCOL_PREFIX = "webclient";

export const LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}[\\d]+`;

export const PROTON_API_ENTRY_VALUE_PREFIX = "local:::";

export const PROTON_API_ENTRY_PRIMARY_VALUE = "https://mail.protonmail.com";

function getBuiltInWebClientTitle(): string {
    return PROVIDER_REPO_MAP["proton-mail"].commit.substr(0, 7);
}

export const PROTON_API_ENTRY_RECORDS: DeepReadonly<EntryUrlItem[]> = [
    {
        value: PROTON_API_ENTRY_PRIMARY_VALUE,
        title: `${PROTON_API_ENTRY_PRIMARY_VALUE} (${getBuiltInWebClientTitle()})`,
    },
    {
        value: "https://app.protonmail.ch",
        title: `https://app.protonmail.ch (${getBuiltInWebClientTitle()})`,
    },
    {
        value: "https://protonirockerxow.onion",
        title: `https://protonirockerxow.onion (${getBuiltInWebClientTitle()})`,
    },
];

export const PROTON_API_ENTRY_URLS = PROTON_API_ENTRY_RECORDS.map(({value: url}) => url);

export const WEB_CLIENTS_BLANK_HTML_FILE_NAME = "blank.html";

export const LOG_LEVELS: Readonly<LogLevel[]> = Object.keys(
    ((stub: Record<LogLevel, null>) => stub)({ // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        error: null,
        warn: null,
        info: null,
        verbose: null,
        debug: null,
        silly: null,
    }),
) as Readonly<LogLevel[]>;

export const ZOOM_FACTOR_DEFAULT = 1;

export const ZOOM_FACTORS: ReadonlyArray<number> = [
    0.5,
    0.55,
    0.6,
    0.65,
    0.7,
    0.75,
    0.8,
    0.85,
    0.9,
    0.95,
    ZOOM_FACTOR_DEFAULT,
    1.05,
    1.1,
    1.15,
    1.2,
    1.25,
    1.3,
    1.35,
    1.4,
    1.45,
    1.5,
    1.6,
    1.7,
    1.8,
    1.9,
    2,
];

export const LAYOUT_MODES = [
    {value: "top", title: "Top"},
    {value: "left", title: "Left"},
    {value: "left-thin", title: "Left (thin)"},
] as const;

export const WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS = "ELECTRON_MAIL_SKIP_LOGIN_DELAYS";

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export const WEB_PROTOCOL_SCHEME = "web";

export const ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN = "$URL";

// user data dir, defaults to app.getPath("userData")
export const RUNTIME_ENV_USER_DATA_DIR = "ELECTRON_MAIL_USER_DATA_DIR";

// ci-specific
export const RUNTIME_ENV_CI_PROTON_CLIENTS_ONLY = "ELECTRON_MAIL_CI_PROTON_CLIENTS_ONLY";
export const RUNTIME_ENV_CI_REMOVE_OUTPUT_GIT_DIR = "ELECTRON_MAIL_CI_REMOVE_OUTPUT_GIT_DIR";

// protonmail account to login during e2e tests running
export const RUNTIME_ENV_E2E_PROTONMAIL_LOGIN = "ELECTRON_MAIL_E2E_PROTONMAIL_LOGIN";
export const RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD = "ELECTRON_MAIL_E2E_PROTONMAIL_PASSWORD";
export const RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE = "ELECTRON_MAIL_E2E_PROTONMAIL_2FA_CODE";
export const RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN = "ELECTRON_MAIL_E2E_PROTONMAIL_UNREAD_MIN";
