import packageJSON from "package.json" assert {type: "json"};

import {LogLevel} from "src/shared/model/common";
import {PROTON_SHARED_MESSAGE_INTERFACE} from "src/shared/const/proton-apps";

const {
    description: PACKAGE_DESCRIPTION,
    homepage: PACKAGE_GITHUB_PROJECT_URL,
    license: PACKAGE_LICENSE,
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
} = packageJSON;

export const PRODUCT_NAME = "ElectronMail";

export const REPOSITORY_NAME = PRODUCT_NAME;

export const BINARY_NAME = PACKAGE_NAME;

export {PACKAGE_DESCRIPTION, PACKAGE_GITHUB_PROJECT_URL, PACKAGE_LICENSE, PACKAGE_NAME, PACKAGE_VERSION};

export const ONE_KB_BYTES = 1024;

export const ONE_MB_BYTES = ONE_KB_BYTES * ONE_KB_BYTES;

export const ONE_SECOND_MS = 1000;

export const ONE_MINUTE_MS = ONE_SECOND_MS * 60;

export const DEFAULT_API_CALL_TIMEOUT = ONE_SECOND_MS * 25;

export const DEFAULT_TRAY_ICON_COLOR = "#1ca48c"; // src/assets/icon/icon.png dominant color

export const DEFAULT_UNREAD_BADGE_BG_COLOR = "#de4251";

export const DEFAULT_UNREAD_BADGE_BG_TEXT = "#ffffff";

export const DEFAULT_MESSAGES_STORE_PORTION_SIZE = 500;

export const UPDATE_CHECK_FETCH_TIMEOUT = ONE_SECOND_MS * 10;

export const PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION = {
    // TODO "electron-builder" doesn't pack the resources with "node_modules" folder in the path, so renamed to "node_modules_" for now
    // TODO ".txt" extension used since "electron-builder" somewhere internally disabled packing "*.d.ts" files since v22.11.1
    system: "./assets/db-search-monaco-editor/node_modules_/typescript/lib/lib.esnext.d.ts.txt",
    protonMessage: `./assets/db-search-monaco-editor/proton-shared/${
        PROTON_SHARED_MESSAGE_INTERFACE.projectRelativeFile.replace(".ts", ".d.ts.txt")
    }`,
} as const;

export const LOCAL_WEBCLIENT_SCHEME_NAME = "webclient";

export const LOCAL_WEBCLIENT_DIR_NAME = "mail.proton.me";

export const LOCAL_WEBCLIENT_ORIGIN = `${LOCAL_WEBCLIENT_SCHEME_NAME}://${LOCAL_WEBCLIENT_DIR_NAME}`;

export const WEB_CLIENTS_BLANK_HTML_FILE_NAME = "blank.html";

export const LOG_LEVELS: Readonly<LogLevel[]> = Object.keys(((stub: Record<LogLevel, null>) => stub)({ // eslint-disable-line @typescript-eslint/explicit-module-boundary-types, max-len
    error: null,
    warn: null,
    info: null,
    verbose: null,
    debug: null,
    silly: null,
})) as Readonly<LogLevel[]>;

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

export const LAYOUT_MODES = [{value: "top", title: "Top"}, {value: "left", title: "Left"}, {
    value: "left-thin",
    title: "Left (thin)",
}] as const;

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export const WEB_PROTOCOL_SCHEME = "web";

export const WEB_PROTOCOL_DIR = WEB_PROTOCOL_SCHEME;

export const BROWSER_WINDOW_RELATIVE_DESKTOP_NOTIFICATION_ICON = "browser-window/desktop-notification-icon.png";

export const ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN = "$URL";

// user data dir, defaults to app.getPath("userData")
export const RUNTIME_ENV_USER_DATA_DIR = "ELECTRON_MAIL_USER_DATA_DIR";

// protonmail account to login during e2e tests running
export const RUNTIME_ENV_E2E_PROTONMAIL_LOGIN = "ELECTRON_MAIL_E2E_PROTONMAIL_LOGIN";
export const RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD = "ELECTRON_MAIL_E2E_PROTONMAIL_PASSWORD";
export const RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE = "ELECTRON_MAIL_E2E_PROTONMAIL_2FA_CODE";
export const RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN = "ELECTRON_MAIL_E2E_PROTONMAIL_UNREAD_MIN";
