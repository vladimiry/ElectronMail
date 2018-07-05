import {Observable} from "rxjs/Observable";

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type UnpackedObservable<T> =
    T extends Observable<infer U> ? U :
        T;
