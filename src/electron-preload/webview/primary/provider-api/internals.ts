import {BehaviorSubject} from "rxjs";

import * as webpackJsonpPushUtil from "src/electron-preload/webview/lib/provider-api/webpack-jsonp-push-util";
import {NEVER_FN} from "src/electron-preload/webview/lib/provider-api/const";
import {ProviderInternals, ProviderInternalsLazy} from "./model";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";
import {curryFunctionMembers} from "src/shared/util";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[provider-api/internals]");

export const resolveProviderInternals = async (): Promise<ProviderInternals> => {
    const logger = curryFunctionMembers(_logger, "resolveProviderInternals()");

    logger.info();

    return new Promise((resolve /*, reject */) => { // TODO reject on timeout
        const result: ProviderInternals = {
            "./src/app/containers/PageContainer.tsx": {
                value$: new BehaviorSubject(
                    {privateScope: null} as Unpacked<ProviderInternals["./src/app/containers/PageContainer.tsx"]["value$"]>
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                _valueShape: null as any,
            },
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
                value: {setParamsInLocation: NEVER_FN},
            },
        };
        const resolveIfFullyInitialized = webpackJsonpPushUtil.buildFullyInitializedResolver(result, resolve, logger);

        webpackJsonpPushUtil.overridePushMethodGlobally({
            resultKeys: Object.keys(result) as ReadonlyArray<keyof typeof result>,
            preChunkItemOverridingHook({resultKey}) {
                if (
                    resultKey === "./src/app/containers/PageContainer.tsx"
                    ||
                    resultKey === "./src/app/helpers/message/messageDecrypt.ts"
                ) {
                    // mark lazy-loaded modules as initialized immediately since these modules get
                    // loaded only after the user gets logged in but we need to resolve the promise on initial load
                    webpackJsonpPushUtil.markInternalsRecordAsInitialized(result, resultKey, resolveIfFullyInitialized, logger);
                }
            },
            chunkItemHook({resultKey, webpack_exports, webpack_require}) {
                if (resultKey === "./src/app/containers/PageContainer.tsx") {
                    webpackJsonpPushUtil.handleObservableValue(
                        result,
                        {
                            resultKey,
                            webpack_exports,
                            itemName: "PageParamsParser",
                            itemCallResultTypeValidation: "object", // import("react").ReactNode
                            itemCallResultHandler: (itemCallResult, notify, markAsInitialized) => {
                                const {createElement, useEffect}
                                    = webpack_require<typeof import("react")>("./node_modules/react/index.js");
                                const result = [
                                    createElement(() => {
                                        const useGetEncryptionPreferencesModule = (() => {
                                            const key = "./node_modules/react-components/hooks/useGetEncryptionPreferences.ts";
                                            return webpack_require<ProviderInternalsLazy[typeof key]>(key);
                                        })();
                                        const useAttachmentCacheModule = (() => {
                                            const key = "./src/app/containers/AttachmentProvider.tsx";
                                            return webpack_require<ProviderInternalsLazy[typeof key]>(key);
                                        })();
                                        const getDecryptedAttachmentModule = (() => {
                                            const key = "./src/app/helpers/attachment/attachmentLoader.ts";
                                            return webpack_require<ProviderInternalsLazy[typeof key]>(key);
                                        })();
                                        const useGetMessageKeysModule = (() => {
                                            const key = "./src/app/hooks/message/useMessageKeys.ts";
                                            return webpack_require<ProviderInternalsLazy[typeof key]>(key);
                                        })();

                                        // WARN contexts should be resolved outside of the "useEffect" handler
                                        // TODO validate resolved proton entities (at least test the "typeof" result)
                                        const getEncryptionPreferences = useGetEncryptionPreferencesModule.default();
                                        const attachmentCache = useAttachmentCacheModule.useAttachmentCache();
                                        const {getDecryptedAttachment} = getDecryptedAttachmentModule;
                                        const getMessageKeys = useGetMessageKeysModule.useMessageKeys();

                                        useEffect(() => {
                                            notify({
                                                privateScope: {
                                                    getEncryptionPreferences,
                                                    getMessageKeys,
                                                    attachmentCache,
                                                    getDecryptedAttachment,
                                                },
                                            });
                                            // TODO consider notifying null on component destroying stage
                                        });

                                        return null; // no rendering needed
                                    }),
                                    itemCallResult,
                                ];

                                // immediate initialization mark set since this component doesn't get instantiated right on proton
                                // app start but after the user gets logged-in (we need to resolve the promise on initial load)
                                markAsInitialized();

                                return result;
                            },
                            resolveIfFullyInitialized,
                        },
                        logger,
                    );

                    return;
                }

                // TODO enable declarative custom validation support
                if (resultKey === "./node_modules/proton-shared/lib/models/mailSettingsModel.js") {
                    type ValueType = (typeof result)[typeof resultKey]["value"];
                    const key: keyof ValueType = "MailSettingsModel";
                    const value = webpack_exports[key] as Partial<ValueType[typeof key]> | null;
                    if (typeof value?.key !== "string") {
                        throw new Error(`Export item validation failed: ${JSON.stringify({resultKey, key})}`);
                    }
                } else if (resultKey === "./node_modules/proton-shared/lib/constants.ts") {
                    type ValueType = (typeof result)[typeof resultKey]["value"];
                    const key: keyof ValueType = "VIEW_MODE";
                    const value = webpack_exports[key] as Partial<ValueType[typeof key]> | null;
                    if (
                        typeof value?.GROUP !== "number"
                        ||
                        typeof value?.SINGLE !== "number"
                    ) {
                        throw new Error(`Export item validation failed: ${JSON.stringify({resultKey, key})}`);
                    }
                }

                webpackJsonpPushUtil.plainChunkItemHandler({
                    resultKey,
                    resultItem: result[resultKey],
                    markInternalsRecordAsInitialized() {
                        webpackJsonpPushUtil.markInternalsRecordAsInitialized(result, resultKey, resolveIfFullyInitialized, logger);
                    },
                    webpack_exports,
                    logger
                });
            },
            logger,
        });
    });
};
