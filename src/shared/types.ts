// tslint:disable-next-line:no-import-zones
import logger from "electron-log";
import {Observable} from "rxjs";

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Arguments<F extends (...x: any[]) => any> =
    F extends (...x: infer A) => any ? A : never;

export type Unpacked<T> =
    T extends Array<infer U1> ? U1 :
        T extends Promise<infer U2> ? U2 :
            T extends Observable<infer U3> ? U3 :
                T;

export type Timestamp = ReturnType<typeof Date.prototype.getTime>;

export interface EntryUrlItem {
    value: string;
    title: string;
}

export type NumberString = string;

export type Logger = Omit<typeof logger, "transports">;
