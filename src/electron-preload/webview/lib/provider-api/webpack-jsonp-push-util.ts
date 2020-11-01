import {AddInitializedProp, PickObservableValues, WebpackJsonpArrayItem, WebpackJsonpPropAwareWindow} from "./model";
import {Logger} from "src/shared/model/common";
import {assertTypeOf} from "src/shared/util";

export const buildFullyInitializedResolver = <T extends Record<string, { initialized?: boolean }>>(
    result: T,
    resolve: (value: typeof result) => void,
    logger: Logger,
): () => void => {
    return () => {
        const unInitializedEntries = Object
            .entries(result)
            .filter(([, value]) => !value.initialized);

        if (unInitializedEntries.length) {
            const uninitializedKeys = unInitializedEntries.map(([key]) => key);
            logger.verbose(`uninitialized keys (${uninitializedKeys.length}):`, JSON.stringify(uninitializedKeys));
            return;
        }

        logger.info("resolve()");

        resolve(result);

        // TODO proton v4: prevent proton app crashing on "webpackJsonp.push" override unmounting
        // logger.verbose(`unmount "webpackJsonp.push" override`); // TODO also unmount on rejection
        // webpackJsonp.push = webpackJsonpPushOriginal;
    };
};

export const markInternalsRecordAsInitialized = <T>(
    result: AddInitializedProp<T>,
    resultKey: keyof typeof result,
    resolveIfAllInitialized: () => void,
    logger: Logger,
): void => {
    if (result[resultKey].initialized) {
        return;
    }

    result[resultKey].initialized = true;

    logger.verbose("[markInternalsRecordAsInitialized()]", `internals record initialized: ${JSON.stringify({resultKey: resultKey})}`);

    resolveIfAllInitialized();
};

export const plainChunkItemHandler = <T, RI extends { value: Record<string, unknown> }>(
    {
        resultKey, // TODO consider dropping "resultKey" arg (used here for logging purposes only)
        resultItem,
        markInternalsRecordAsInitialized,
        webpack_exports,
        logger,
    }: {
        resultKey: keyof AddInitializedProp<T>,
        resultItem: RI,
        markInternalsRecordAsInitialized: () => void,
        webpack_exports: Parameters<import("ts-essentials").ValueOf<WebpackJsonpArrayItem[1]>>[1],
        logger: Logger
    }
): void => {
    // simple key presence and top-level value type runtime validation
    for (const [key, valueStub] of Object.entries(resultItem.value)) {
        if (!(key in webpack_exports)) {
            throw new Error(`Failed to locate expected "${key}" in the webpack exports object`);
        }
        assertTypeOf(
            {value: webpack_exports[key], expectedType: typeof valueStub},
            "Failed to locate expected value type",
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    (resultItem as Mutable<typeof resultItem>).value = webpack_exports as any;

    markInternalsRecordAsInitialized();

    {
        const typeOf = typeof resultItem.value;
        const details = {
            resultKey,
            typeOf,
            ...(typeOf === "object" && {ownPropertyNames: Object.getOwnPropertyNames(resultItem.value)}),
        };
        logger.verbose(`initialized: ${JSON.stringify(details)}`);
    }
};

export const overridePushMethodGlobally = <T>(
    {
        resultKeys,
        preChunkItemOverridingHook,
        chunkItemHook,
        logger,
    }: {
        resultKeys: ReadonlyArray<keyof T>,
        preChunkItemOverridingHook?: (arg: { resultKey: ReadonlyArray<keyof T>[number] }) => void,
        chunkItemHook: (
            arg: {
                resultKey: ReadonlyArray<keyof T>[number],
                webpack_exports: Parameters<import("ts-essentials").ValueOf<WebpackJsonpArrayItem[1]>>[1],
                webpack_require: Parameters<import("ts-essentials").ValueOf<WebpackJsonpArrayItem[1]>>[2],
            }
        ) => void,
        logger: Logger,
    },
): void => {
    const webpackJsonpAwareWindow = window as WebpackJsonpPropAwareWindow;
    const webpackJsonp = webpackJsonpAwareWindow.webpackJsonp = webpackJsonpAwareWindow.webpackJsonp || [];
    const webpackJsonpPushOriginalWithBoundContext = webpackJsonp.push.bind(webpackJsonp);
    const webpackJsonpPushOverridden: typeof webpackJsonpPushOriginalWithBoundContext = (firstArg, ...restArgs) => {
        const webpackJsonpPushOriginalCallResult = webpackJsonpPushOriginalWithBoundContext(firstArg, ...restArgs);
        const [/* chunkItemsIdx */, chunkItemsRecord] = firstArg;

        for (const resultKey of resultKeys) {
            const [chunkItemKey, chunkItemValue] = Object
                .entries(chunkItemsRecord)
                .find(([key]) => key === resultKey) ?? [null, null] as const;

            if (!chunkItemKey || !chunkItemValue) {
                continue;
            }

            if (preChunkItemOverridingHook) {
                preChunkItemOverridingHook({resultKey});
            }

            chunkItemsRecord[chunkItemKey] = function(...args) { // function(module, webpack_exports, webpack_require) {
                const chunkItemValueCallResult = chunkItemValue.apply(this, args);
                const [/* module */, webpack_exports, webpack_require] = args;

                chunkItemHook({resultKey, webpack_exports, webpack_require});

                return chunkItemValueCallResult;
            };
        }

        return webpackJsonpPushOriginalCallResult;
    };

    logger.verbose(`mount "webpackJsonp.push" override`);

    webpackJsonp.push = webpackJsonpPushOverridden;
};

export const handleObservableValue = <R,
    T extends AddInitializedProp<PickObservableValues<R>>,
    K extends Extract<keyof T, string>>(
    result: T,
    {
        resultKey,
        webpack_exports,
        itemKey = "default",
        itemName,
        itemCallResultHandler,
        itemCallResultTypeValidation,
        resolveIfFullyInitialized,
    }: {
        resultKey: K,
        webpack_exports: Exclude<Parameters<import("ts-essentials").ValueOf<WebpackJsonpArrayItem[1]>>[1], undefined>
        itemKey?: string
        itemName: string
        itemCallResultHandler?: (
            itemCallResult: ReturnType<T[K]["_valueShape"]>,
            notify: (notification: Unpacked<typeof result[K]["value$"]>) => void,
            markAsInitialized: () => void,
        ) => void | undefined | import("react").ReactNode[]
        itemCallResultTypeValidation?: "function" | "object"
        resolveIfFullyInitialized: () => void
    },
    logger: Logger,
): void => {
    logger.verbose("[handleObservableValue()]");

    const markAsInitialized = (): void => {
        markInternalsRecordAsInitialized(
            result,
            resultKey,
            resolveIfFullyInitialized,
            logger,
        );
    };
    const item = webpack_exports[itemKey] as T[K]["_valueShape"];

    assertTypeOf({value: item, expectedType: "function"}, "Invalid exported item type");

    {
        const {name: actualName} = item;
        const expectedName = itemName;
        if (actualName !== expectedName) {
            throw new Error(`Invalid exported item name: ${JSON.stringify({resultKey, actualName, expectedName})}`);
        }
    }

    const exportsItemOverridden: typeof item = function(...args) {
        const itemCallResult = item(...args);

        if (itemCallResultTypeValidation) {
            assertTypeOf(
                {value: itemCallResult, expectedType: itemCallResultTypeValidation},
                "Unexpected exported item call result type",
            );
        }

        const itemCallResultCustom = itemCallResultHandler && itemCallResultHandler(
            itemCallResult as ReturnType<typeof item>,
            (notification) => {
                result[resultKey].value$.next(
                    notification as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                );
            },
            markAsInitialized,
        );

        return typeof itemCallResultCustom !== "undefined"
            ? itemCallResultCustom
            : itemCallResult;
    };

    webpack_exports[itemKey] = exportsItemOverridden;
};
