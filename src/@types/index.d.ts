import {Observable} from "rxjs";

import {Omit} from "type-fest";

declare global {
    type Arguments<F extends (...x: any[]) => any> =
        F extends (...x: infer A) => any ? A : never;

    type Unpacked<T> =
        T extends Array<infer U1> ? U1 :
            T extends ReadonlyArray<infer U1> ? U1 :
                T extends Promise<infer U2> ? U2 :
                    T extends Observable<infer U3> ? U3 :
                        T;

    type Mutable<T> = { -readonly [K in keyof T]: T[K]; };

    type Skip<T, K extends keyof T> = Omit<T, K>; // eslint-disable-line @typescript-eslint/ban-types
}
