import logger, {ILogLevel} from "electron-log";

export type BuildEnvironment = "production" | "development" | "test";

export type Timestamp = ReturnType<typeof Date.prototype.getTime>;

export interface EntryUrlItem {
    value: string;
    title: string;
}

export type NumberString = string;

export type Logger = Pick<typeof logger, ILogLevel>;

export type LogLevel = keyof Logger;

// TODO consider not using a raw string type but deriving locale items from:
//      - https://electronjs.org/docs/api/locales
//      - @types/chrome-apps:chrome.i18n.kLanguageInfoTable
export type Locale = string;
