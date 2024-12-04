import {BehaviorSubject} from "rxjs";

import {curryFunctionMembers} from "src/shared/util";
import {WEBVIEW_PRIMARY_INTERNALS_KEYS} from "./const";
import {ProviderInternals} from "./model";
import * as webpackJsonpPushUtil from "src/electron-preload/webview/primary/lib/provider-api/webpack-jsonp-push-util";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

export const resolveProviderInternals = async <
    T extends keyof typeof WEBVIEW_PRIMARY_INTERNALS_KEYS,
    K extends typeof WEBVIEW_PRIMARY_INTERNALS_KEYS[T]["key"],
>(
    appType: T,
): Promise<Pick<ProviderInternals, K>> => {
    const logger = curryFunctionMembers(_logger, nameof(resolveProviderInternals));

    logger.info();

    return new Promise<Pick<ProviderInternals, K>>((resolve /*, reject */) => { // TODO reject on timeout
        const result: ProviderInternals = { // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            [WEBVIEW_PRIMARY_INTERNALS_KEYS[appType].key]: {
                value$: new BehaviorSubject({privateScope: null}),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                _valueShape: null as any,
            },
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const resolveIfFullyInitialized = webpackJsonpPushUtil.buildFullyInitializedResolver(result, resolve, logger);

        webpackJsonpPushUtil.overridePushMethodGlobally({
            resultKeys: [WEBVIEW_PRIMARY_INTERNALS_KEYS[appType].key] as const,

            preChunkItemOverridingHook({resultKey}) {
                if (resultKey === WEBVIEW_PRIMARY_INTERNALS_KEYS[appType].key) {
                    // mark lazy-loaded modules as initialized immediately since these modules get
                    // loaded only after a user gets signed-in, but we need to resolve the promise on initial load
                    webpackJsonpPushUtil.markInternalsRecordAsInitialized(result, resultKey, resolveIfFullyInitialized, logger);
                }
            },

            chunkItemHook({resultKey, webpack_exports, webpack_require}) {
                if (resultKey !== WEBVIEW_PRIMARY_INTERNALS_KEYS[appType].key) return;

                webpackJsonpPushUtil.handleObservableValue(result, {
                    resultKey,
                    webpack_exports,
                    ...WEBVIEW_PRIMARY_INTERNALS_KEYS[appType].handleObservableValue,
                    itemCallResultHandler: (itemCallResult, notify, markAsInitialized) => {
                        const {createElement, useEffect} = webpack_require<typeof import("react")>("../../node_modules/react/index.js");
                        const result = [
                            createElement(() => {
                                useEffect(() => {
                                    notify({privateScope: {}});
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
                }, logger);
            },

            logger,
        });
    });
};
