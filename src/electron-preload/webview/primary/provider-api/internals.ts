import {BehaviorSubject, ReplaySubject} from "rxjs";

import {NEVER_FN} from "./const";
import {
    ProviderInternals,
    ProviderInternalsLazy,
    ProviderInternalsObservable,
    WebpackJsonpArrayItem,
    WebpackJsonpPropAwareWindow
} from "./model";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {assertTypeOf, curryFunctionMembers} from "src/shared/util";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[provider-api/internals]");

const markInternalsRecordAsInitialized = (
    result: ProviderInternals,
    resultKey: keyof typeof result,
    resolveIfAllInitialized: () => void,
): void => {
    if (result[resultKey].initialized) {
        return;
    }
    result[resultKey].initialized = true;
    _logger.verbose(`markInternalsRecordAsInitialized() internals record initialized: ${JSON.stringify({resultKey: resultKey})}`);
    resolveIfAllInitialized();
};

const handleObservableValue = <RK extends keyof ProviderInternalsObservable>(
    result: ProviderInternalsObservable,
    {
        resultKey,
        exportsModule,
        exportsItemKey = "default",
        exportsItemName,
        exportsItemCallResultHandler,
        exportsItemCallResultTypeValidation,
        resolveIfFullyInitialized,
    }: {
        resultKey: RK,
        exportsModule: Exclude<Parameters<import("ts-essentials").ValueOf<WebpackJsonpArrayItem[1]>>[1], undefined>
        exportsItemKey?: string
        exportsItemName: string
        exportsItemCallResultHandler?: (
            exportsItemCallResult: ReturnType<ProviderInternals[RK]["_valueShape"]>,
            notify: (notification: Unpacked<typeof result[RK]["value$"]>) => void,
            markAsInitialized: () => void,
        ) => void | undefined | import("react").ReactNode[]
        exportsItemCallResultTypeValidation?: "function" | "object"
        resolveIfFullyInitialized: () => void
    }
): void => {
    const logger = curryFunctionMembers(_logger, "handleObservableValue()");

    logger.info();

    const markAsInitialized = (): void => {
        markInternalsRecordAsInitialized(
            result as Parameters<typeof markInternalsRecordAsInitialized>[0],
            resultKey,
            resolveIfFullyInitialized,
        );
    };
    const exportsItem = exportsModule[exportsItemKey] as ProviderInternals[RK]["_valueShape"];

    assertTypeOf({value: exportsItem, expectedType: "function"}, "Invalid exported item type");

    {
        const {name: actualName} = exportsItem;
        const expectedName = exportsItemName;
        if (actualName !== expectedName) {
            throw new Error(`Invalid exported item name: ${JSON.stringify({resultKey, actualName, expectedName})}`);
        }
    }

    const exportsItemOverridden: typeof exportsItem = function(...args) {
        const exportsItemCallResult = exportsItem(...args);

        if (exportsItemCallResultTypeValidation) {
            assertTypeOf(
                {value: exportsItemCallResult, expectedType: exportsItemCallResultTypeValidation},
                "Unexpected exported item call result type",
            );
        }

        const exportsItemCallResultCustom = exportsItemCallResultHandler && exportsItemCallResultHandler(
            exportsItemCallResult as ReturnType<typeof exportsItem>,
            (notification) => {
                result[resultKey].value$.next(
                    notification as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                );
            },
            markAsInitialized,
        );

        return typeof exportsItemCallResultCustom !== "undefined"
            ? exportsItemCallResultCustom
            : exportsItemCallResult;
    };

    exportsModule[exportsItemKey] = exportsItemOverridden;
};

export const resolveProviderInternals = async (): Promise<ProviderInternals> => {
    const logger = curryFunctionMembers(_logger, "resolveProviderInternals()");

    logger.info();

    return new Promise((resolve /*, reject*/) => { // TODO reject on timeout
        const observableResultKeys: ReadonlyArray<keyof ProviderInternalsObservable> = [
            "./node_modules/react-components/containers/app/StandardSetup.tsx",
            "./src/app/containers/PageContainer.tsx",
        ];
        const observablesResult = observableResultKeys.reduce(
            (accumulator, key) => {
                const _valueShape = null as unknown as (typeof accumulator)[typeof key]["_valueShape"];
                if (key === "./src/app/containers/PageContainer.tsx") {
                    const value: Unpacked<(typeof accumulator)[typeof key]["value$"]> = {privateScope: null}; // initial value
                    (accumulator as Mutable<typeof accumulator>)[key] = {value$: new BehaviorSubject(value), _valueShape};
                } else {
                    (accumulator as Mutable<typeof accumulator>)[key] = {value$: new ReplaySubject(1), _valueShape};
                }
                return accumulator;
            },
            {} as Pick<ProviderInternals, (typeof observableResultKeys)[number]>,
        );
        const result: ProviderInternals = {
            ...observablesResult,
            "./src/app/helpers/message/messageDecrypt.ts": {
                value: {decryptMessage: NEVER_FN},
            },
            "./node_modules/proton-shared/lib/constants.ts": {
                value: {VIEW_MODE: {GROUP: NaN, SINGLE: NaN}},
            },
            "./node_modules/proton-shared/lib/models/mailSettingsModel.js": {
                value: {MailSettingsModel: {key: ""}},
            },
            "./node_modules/proton-shared/lib/api/labels.ts": {
                value: {get: NEVER_FN},
            },
            "./node_modules/proton-shared/lib/api/conversations.js": {
                value: {getConversation: NEVER_FN, queryConversations: NEVER_FN},
            },
            "./node_modules/proton-shared/lib/api/messages.js": {
                value: {
                    getMessage: NEVER_FN,
                    queryMessageMetadata: NEVER_FN,
                    labelMessages: NEVER_FN,
                    markMessageAsRead: NEVER_FN,
                    deleteMessages: NEVER_FN,
                },
            },
            "./node_modules/proton-shared/lib/api/contacts.ts": {
                value: {queryContacts: NEVER_FN, getContact: NEVER_FN},
            },
            "./node_modules/proton-shared/lib/api/events.ts": {
                value: {getEvents: NEVER_FN, getLatestID: NEVER_FN},
            },
            "./src/app/helpers/mailboxUrl.ts": {
                value: {setPathInUrl: NEVER_FN},
            },
        };
        const resultKeys = Object.keys(result) as ReadonlyArray<keyof typeof result>;
        const resolveIfFullyInitialized = (): void => {
            const uninitializedEntries = Object
                .entries(result)
                .filter(([, value]) => !value.initialized);
            if (uninitializedEntries.length) {
                const uninitializedKeys = uninitializedEntries.map(([key]) => key);
                logger.verbose(`uninitialized keys (${uninitializedKeys.length}):`, JSON.stringify(uninitializedKeys));
                return;
            }
            logger.info("resolve()");
            resolve(result);
            // TODO proton v4: prevent proton app crashing on "webpackJsonp.push" override unmounting
            // logger.verbose(`unmount "webpackJsonp.push" override`); // TODO also unmount on rejection
            // webpackJsonp.push = webpackJsonpPushOriginal;
        };
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

                if (
                    resultKey === "./src/app/containers/PageContainer.tsx"
                    ||
                    resultKey === "./src/app/helpers/message/messageDecrypt.ts"
                ) {
                    // mark lazy-loaded modules as initialized immediately
                    // since these modules get loaded only after the user gets logged in but we need to resolve the promise on initial load
                    markInternalsRecordAsInitialized(result, resultKey, resolveIfFullyInitialized);
                }

                chunkItemsRecord[chunkItemKey] = function(...args) { // function(module, __webpack_exports__, __webpack_require__) {
                    const chunkItemValueCallResult = chunkItemValue.apply(this, args);
                    const [/* module */, __webpack_exports__, __webpack_require__] = args;

                    // eslint-disable-next-line sonarjs/no-small-switch
                    switch (resultKey) {
                        case "./node_modules/react-components/containers/app/StandardSetup.tsx": {
                            handleObservableValue(result, {
                                resultKey,
                                exportsModule: __webpack_exports__,
                                exportsItemName: "StandardSetup",
                                exportsItemCallResultTypeValidation: "object", // import("react").ReactNode
                                exportsItemCallResultHandler: (exportsItemCallResult, notify, markAsInitialized) => {
                                    const {createElement, useEffect}
                                        = __webpack_require__<typeof import("react")>("./node_modules/react/index.js");
                                    return [
                                        createElement(() => {
                                            const useApiModule = (() => {
                                                const key = "./node_modules/react-components/hooks/useApi.ts";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();
                                            const useAuthenticationModule = (() => {
                                                const key = "./node_modules/react-components/hooks/useAuthentication.ts";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();
                                            const useCacheModule = (() => {
                                                const key = "./node_modules/react-components/hooks/useCache.ts";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();
                                            const reactRouterModule = (() => {
                                                const key = "./node_modules/react-router/esm/react-router.js";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();

                                            // WARN contexts should be resolved outside of the "useEffect" handler
                                            // TODO validate resolved proton entities (at least test the "typeof" result)
                                            const httpApi = useApiModule.default();
                                            const authentication = useAuthenticationModule.default();
                                            const cache = useCacheModule.default();
                                            const history = reactRouterModule.useHistory();

                                            useEffect(() => {
                                                notify({publicScope: {httpApi, authentication, cache, history}});
                                                markAsInitialized();
                                            });

                                            return null; // no rendering needed
                                        }),
                                        exportsItemCallResult,
                                    ];
                                },
                                resolveIfFullyInitialized,
                            });
                            break;
                        }
                        case "./src/app/containers/PageContainer.tsx": {
                            handleObservableValue(result, {
                                resultKey,
                                exportsModule: __webpack_exports__,
                                exportsItemName: "PageParamsParser",
                                exportsItemCallResultTypeValidation: "object", // import("react").ReactNode
                                exportsItemCallResultHandler: (exportsItemCallResult, notify, markAsInitialized) => {
                                    const {createElement, useEffect}
                                        = __webpack_require__<typeof import("react")>("./node_modules/react/index.js");
                                    const result = [
                                        createElement(() => {
                                            const useGetEncryptionPreferencesModule = (() => {
                                                const key = "./node_modules/react-components/hooks/useGetEncryptionPreferences.ts";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();
                                            const useGetMessageKeysModule = (() => {
                                                const key = "./src/app/hooks/message/useMessageKeys.ts";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();
                                            const useAttachmentCacheModule = (() => {
                                                const key = "./src/app/containers/AttachmentProvider.tsx";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();
                                            const getDecryptedAttachmentModule = (() => {
                                                const key = "./src/app/helpers/attachment/attachmentLoader.ts";
                                                return __webpack_require__<ProviderInternalsLazy[typeof key]>(key);
                                            })();

                                            // WARN contexts should be resolved outside of the "useEffect" handler
                                            // TODO validate resolved proton entities (at least test the "typeof" result)
                                            const getEncryptionPreferences = useGetEncryptionPreferencesModule.default();
                                            const getMessageKeys = useGetMessageKeysModule.useMessageKeys();
                                            const attachmentCache = useAttachmentCacheModule.useAttachmentCache();
                                            const {getDecryptedAttachment} = getDecryptedAttachmentModule;

                                            useEffect(() => { // component mount/after-render lifecycle phase
                                                notify({
                                                    privateScope: {
                                                        getEncryptionPreferences,
                                                        getMessageKeys,
                                                        attachmentCache,
                                                        getDecryptedAttachment,
                                                    },
                                                });
                                                // don't notify null since component gets unmounted/destroyed/re-created quite frequently
                                                // return () => { // component unmount lifecycle phase
                                                //     notify({privateScope: null});
                                                // };
                                            });

                                            return null; // no rendering needed
                                        }),
                                        exportsItemCallResult,
                                    ];

                                    // immediate initialization mark set since this component doesn't get instantiated right on
                                    // proton app start but after the user gets logged-in (we need to resolve the promise on initial load)
                                    markAsInitialized();

                                    return result;
                                },
                                resolveIfFullyInitialized,
                            });
                            break;
                        }
                        default: {
                            // simple key presence and top-level value type runtime validation
                            for (const [key, valueStub] of Object.entries(result[resultKey].value)) {
                                if (!(key in __webpack_exports__)) {
                                    throw new Error(`Failed to locate expected "${key}" in the webpack exports object`);
                                }
                                assertTypeOf(
                                    {value: __webpack_exports__[key], expectedType: typeof valueStub},
                                    "Failed to locate expected value type",
                                );
                            }

                            // TODO enable declarative custom validation support
                            if (resultKey === "./node_modules/proton-shared/lib/models/mailSettingsModel.js") {
                                type ValueType = (typeof result)[typeof resultKey]["value"];
                                const key: keyof ValueType = "MailSettingsModel";
                                const value = __webpack_exports__[key] as Partial<ValueType[typeof key]> | null;
                                if (typeof value?.key !== "string") {
                                    throw new Error(`Export item validation failed: ${JSON.stringify({resultKey, key})}`);
                                }
                            } else if (resultKey === "./node_modules/proton-shared/lib/constants.ts") {
                                type ValueType = (typeof result)[typeof resultKey]["value"];
                                const key: keyof ValueType = "VIEW_MODE";
                                const value = __webpack_exports__[key] as Partial<ValueType[typeof key]> | null;
                                if (
                                    typeof value?.GROUP !== "number"
                                    ||
                                    typeof value?.SINGLE !== "number"
                                ) {
                                    throw new Error(`Export item validation failed: ${JSON.stringify({resultKey, key})}`);
                                }
                            }

                            const resultItem = result[resultKey];
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                            (resultItem as Mutable<typeof resultItem>).value = __webpack_exports__ as any;
                            markInternalsRecordAsInitialized(result, resultKey, resolveIfFullyInitialized);

                            {
                                const typeOf = typeof resultItem.value;
                                const details = {
                                    resultKey,
                                    typeOf,
                                    ...(typeOf === "object" && {ownPropertyNames: Object.getOwnPropertyNames(resultItem.value)}),
                                };
                                logger.verbose(`initialized: ${JSON.stringify(details)}`);
                            }
                        }
                    }

                    return chunkItemValueCallResult;
                };
            }

            return webpackJsonpPushOriginalCallResult;
        };

        logger.verbose(`mount "webpackJsonp.push" override`);
        webpackJsonp.push = webpackJsonpPushOverridden;
    });
};
