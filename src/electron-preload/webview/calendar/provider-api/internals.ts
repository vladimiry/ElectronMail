import {BehaviorSubject} from "rxjs";

import {curryFunctionMembers} from "src/shared/util";
import {ProviderInternals} from "./model";
import * as webpackJsonpPushUtil from "src/electron-preload/webview/lib/provider-api/webpack-jsonp-push-util";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, __filename);

export const resolveProviderInternals = async (): Promise<ProviderInternals> => {
    const logger = curryFunctionMembers(_logger, nameof(resolveProviderInternals));

    logger.info();

    return new Promise<ProviderInternals>((resolve /*, reject */) => { // TODO reject on timeout
        const result: ProviderInternals = {
            "./src/app/./containers/calendar/MainContainer": {
                value$: new BehaviorSubject(
                    {privateScope: null} as Unpacked<ProviderInternals["./src/app/./containers/calendar/MainContainer"]["value$"]>
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                _valueShape: null as any,
            },
        };
        const resolveIfFullyInitialized = webpackJsonpPushUtil.buildFullyInitializedResolver(result, resolve, logger);

        webpackJsonpPushUtil.overridePushMethodGlobally({
            resultKeys: Object.keys(result) as ReadonlyArray<keyof typeof result>,
            preChunkItemOverridingHook({resultKey}) {
                if (
                    resultKey === "./src/app/./containers/calendar/MainContainer"
                ) {
                    // mark lazy-loaded modules as initialized immediately since these modules get
                    // loaded only after the user gets logged in but we need to resolve the promise on initial load
                    webpackJsonpPushUtil.markInternalsRecordAsInitialized(result, resultKey, resolveIfFullyInitialized, logger);
                }
            },
            chunkItemHook({resultKey, webpack_exports, webpack_require}) {
                if (resultKey === "./src/app/./containers/calendar/MainContainer") {
                    webpackJsonpPushUtil.handleObservableValue(
                        result,
                        {
                            resultKey,
                            webpack_exports,
                            itemName: "default",
                            itemCallResultTypeValidation: "object", // import("react").ReactNode
                            itemCallResultHandler: (itemCallResult, notify, markAsInitialized) => {
                                const {createElement, useEffect}
                                    = webpack_require<typeof import("react")>("../../node_modules/react/index.js");
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
                        },
                        logger,
                    );
                }
            },
            logger,
        });

    });
};
