import {EntryUrlItem, LogLevel} from "./model/common";
import {ReadonlyDeep} from "type-fest";

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

export const PROVIDER_REPOS: ReadonlyDeep<Record<"WebClient" | "proton-mail-settings" | "proton-contacts" | "proton-calendar",
    {
        repoRelativeDistDir: string;
        baseDir: string;
        repo: string,
        version: string;
        commit: string;
        protonPackAppConfig: {
            clientId: string;
        },
    }>> = {
    "WebClient": {
        repoRelativeDistDir: "./build",
        baseDir: "", // TODO define model as {baseDir?: string} instead of using empty string value
        repo: "https://github.com/ProtonMail/WebClient.git",
        commit: "4d751fc3ec902a33e14a81076292d14174047a6d",
        version: "4.0.0-beta9",
        protonPackAppConfig: {
            // TODO proton-v4: make sure this value comes to the build after 4.0.0-beta7+ update
            //      currently it's hadrcoded in the WebClient code
            clientId: "Web",
        },
    },
    "proton-mail-settings": {
        repoRelativeDistDir: "./dist",
        baseDir: "settings",
        repo: "https://github.com/ProtonMail/proton-mail-settings.git",
        commit: "41e625d21218f5a5ad767173fce41098e7176458",
        version: "unknown",
        protonPackAppConfig: {
            clientId: "WebMailSettings",
        },
    },
    "proton-contacts": {
        repoRelativeDistDir: "./dist",
        baseDir: "contacts",
        repo: "https://github.com/ProtonMail/proton-contacts.git",
        commit: "aed8afb08426c6b7b12f3260da41e95e7ddca96e",
        version: "unknown",
        protonPackAppConfig: {
            clientId: "WebContacts",
        },
    },
    "proton-calendar": {
        repoRelativeDistDir: "./dist",
        baseDir: "calendar",
        repo: "https://github.com/ProtonMail/proton-calendar.git",
        commit: "5ec480f0b0033264e3d423c75f5f550df151fc91",
        version: "unknown",
        protonPackAppConfig: {
            clientId: "WebCalendar",
        },
    },
};

export const LOCAL_WEBCLIENT_PROTOCOL_PREFIX = "webclient";

export const LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}[\\d]+`;

export const PROTON_API_ENTRY_VALUE_PREFIX = "local:::";

export const PROTON_API_ENTRY_PRIMARY_VALUE = "https://mail.protonmail.com";

export const PROTON_API_ENTRY_RECORDS: ReadonlyDeep<EntryUrlItem[]> = [
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

// export const PROTON_API_ENTRY_ORIGINS = PROTON_API_ENTRY_URLS.map((url) => new URL(url).origin);

export const WEB_CLIENTS_BLANK_HTML_FILE_NAME = "blank.html";

function getBuiltInWebClientTitle(): string {
    return `${PROVIDER_REPOS.WebClient.version} / ${PROVIDER_REPOS.WebClient.commit.substr(0, 7)}`;
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
    {value: "top", title: "top"},
    {value: "left", title: "left"},
    {value: "left-thin", title: "left (thin)"},
] as const;

export const WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS = "ELECTRON_MAIL_SKIP_LOGIN_DELAYS";

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export const WEB_PROTOCOL_SCHEME = "web";
