export type WebpackJsonpArrayItem = readonly [
    readonly [string | number],
    Record<string, (
        module: unknown,
        webpack_exports: Record<string, unknown>,
        webpack_require: <T>(moduleKey: string) => T
    ) => void>
]

export type WebpackJsonpPropAwareWindow = typeof window & {
    webpackJsonp?: WebpackJsonpArrayItem[];
}

export type AddInitializedProp<T> = {
    [K in keyof T]: T[K] & { initialized?: boolean }
}

export type WrapToValueProp<T> = {
    [K in keyof T]: { readonly value: T[K] }
}

export interface DefineObservableValue<T, VS extends (arg: unknown) => unknown = (arg: unknown) => unknown> {
    readonly _valueShape: DeepReadonly<VS>;
    readonly value$: import("rxjs").Subject<T>
}

export type PickObservableValues<T> = import("ts-essentials").NonNever<{
    [K in keyof T]:
    T[K] extends DefineObservableValue<infer U> // eslint-disable-line @typescript-eslint/no-unused-vars
        ? T[K]
        : never
}>
