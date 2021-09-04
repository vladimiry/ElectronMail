import {ReplaySubject} from "rxjs";

import * as webpackJsonpPushUtil from "src/electron-preload/webview/lib/provider-api/webpack-jsonp-push-util";
import {Logger} from "src/shared/model/common";
import {StandardSetupProviderInternals, StandardSetupProviderInternalsLazy} from "./model";
import {curryFunctionMembers} from "src/shared/util";

export const resolveStandardSetupStandardSetupProviderInternals = async (
    _logger: Logger,
    legacyProtonPacking?: boolean,
): Promise<StandardSetupProviderInternals> => {
    const logger = curryFunctionMembers(_logger, nameof(resolveStandardSetupStandardSetupProviderInternals));

    logger.info();

    return new Promise((resolve /*, reject */) => { // TODO reject on timeout
        const result: StandardSetupProviderInternals = {
            "../../packages/components/containers/app/StandardSetup.tsx": {
                value$: new ReplaySubject(1),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                _valueShape: null as any,
            },
        };
        const resolveIfFullyInitialized = webpackJsonpPushUtil.buildFullyInitializedResolver(result, resolve, logger);

        webpackJsonpPushUtil.overridePushMethodGlobally({
            legacyProtonPacking,
            resultKeys: Object.keys(result) as ReadonlyArray<keyof typeof result>,
            chunkItemHook({resultKey, webpack_exports, webpack_require}) {
                if (resultKey === "../../packages/components/containers/app/StandardSetup.tsx") {
                    webpackJsonpPushUtil.handleObservableValue(
                        result,
                        {
                            resultKey,
                            webpack_exports,
                            itemName: "StandardSetup",
                            itemCallResultTypeValidation: "object", // import("react").ReactNode
                            itemCallResultHandler: (itemCallResult, notify, markAsInitialized) => {
                                const {createElement, useEffect}
                                    = webpack_require<typeof import("react")>("../../node_modules/react/index.js");
                                return [
                                    createElement(() => {
                                        const useApiModule = (() => {
                                            const key = "../../packages/components/hooks/useApi.ts";
                                            return webpack_require<StandardSetupProviderInternalsLazy[typeof key]>(key);
                                        })();
                                        const useAuthenticationModule = (() => {
                                            const key = "../../packages/components/hooks/useAuthentication.ts";
                                            return webpack_require<StandardSetupProviderInternalsLazy[typeof key]>(key);
                                        })();
                                        const useCacheModule = (() => {
                                            const key = "../../packages/components/hooks/useCache.ts";
                                            return webpack_require<StandardSetupProviderInternalsLazy[typeof key]>(key);
                                        })();
                                        const reactRouterModule = (() => {
                                            const key = "../../node_modules/react-router/esm/react-router.js";
                                            return webpack_require<StandardSetupProviderInternalsLazy[typeof key]>(key);
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
                                    itemCallResult,
                                ];
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
