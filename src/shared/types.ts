// tslint:disable-next-line:no-import-zones
import logger, {ILogLevel} from "electron-log";
import {Observable} from "rxjs";

export type Arguments<F extends (...x: any[]) => any> =
    F extends (...x: infer A) => any ? A : never;

export type Unpacked<T> =
    T extends Array<infer U1> ? U1 :
        T extends Promise<infer U2> ? U2 :
            T extends Observable<infer U3> ? U3 :
                T;

export type Mutable<T> = { -readonly [K in keyof T]: T[K]; };

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
