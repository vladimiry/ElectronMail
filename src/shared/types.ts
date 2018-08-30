import {Observable} from "rxjs";

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type UnpackedObservable<T> =
    T extends Observable<infer U> ? U :
        T;

export type UnpackedPromise<T> =
    T extends Promise<infer U> ? U :
        T;

export type Arguments<F extends (...x: any[]) => any> =
    F extends (...x: infer A) => any ? A : never;

export type Timestamp = ReturnType<typeof Date.prototype.getTime>;

export interface EntryUrlItem {
    value: string;
    title: string;
}

export type NumberString = string;
