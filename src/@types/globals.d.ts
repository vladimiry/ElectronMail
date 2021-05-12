import {Observable, Subject, Subscriber} from "rxjs";

import {BuildEnvVars} from "webpack-configs/model";

type Impossible<K extends keyof any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    [P in K]: never;
};

declare global {
    type Unpacked<T> =
        T extends Array<infer U1> ? U1 :
            T extends ReadonlyArray<infer U1> ? U1 :
                T extends Promise<infer U2> ? U2 :
                    T extends Observable<infer U3> ? U3 :
                        T extends Subject<infer U3> ? U3 :
                            T extends Subscriber<infer U3> ? U3 :
                                T;

    type Mutable<T> = import("ts-essentials").Writable<T>;

    // TODO add "DeepNoExtraProps" type
    type NoExtraProps<T, U extends T = T> = U & Impossible<Exclude<keyof U, keyof T>>;

    type StrictOmit<T, K extends keyof T> = import("ts-essentials").StrictOmit<T, K>;

    type StrictExclude<T, K extends T> = Exclude<T, K>;

    type StrictExtract<T, K extends T> = Extract<T, K>;

    type DeepReadonly<T> = import("ts-essentials").DeepReadonly<T>;

    const BUILD_ENVIRONMENT: BuildEnvVars["BUILD_ENVIRONMENT"];
    const BUILD_DISABLE_START_HIDDEN_FEATURE: BuildEnvVars["BUILD_DISABLE_START_HIDDEN_FEATURE"];
    const BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE: BuildEnvVars["BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE"];
    const BUILD_START_MAXIMIZED_BY_DEFAULT: BuildEnvVars["BUILD_START_MAXIMIZED_BY_DEFAULT"];
}
