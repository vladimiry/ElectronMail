import {combineLatest} from "rxjs";
import {distinctUntilChanged, map} from "rxjs/operators";

import {curryFunctionMembers} from "src/shared/util";
import {WEBVIEW_PRIMARY_INTERNALS_KEYS} from "./const";
import {resolveProviderInternals} from "./internals";
import {resolveStandardSetupPublicApi} from "src/electron-preload/webview/primary/lib/provider-api/standart-setup-internals";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

export type ProviderApi = DeepReadonly<{_custom_: {loggedIn$: import("rxjs").Observable<boolean>}}>;

export const initProviderApi = async (appType: keyof typeof WEBVIEW_PRIMARY_INTERNALS_KEYS): Promise<ProviderApi> => {
    const logger = curryFunctionMembers(_logger, [nameof(initProviderApi), JSON.stringify({appType})]);

    logger.info();

    return (async (): Promise<ProviderApi> => {
        const [standardSetupPublicApi, internals] = await Promise.all([
            resolveStandardSetupPublicApi(logger),
            resolveProviderInternals(appType),
        ]);
        const internalsPrivateScope$ = internals[WEBVIEW_PRIMARY_INTERNALS_KEYS[appType].key].value$.pipe(distinctUntilChanged());
        const providerApi: ProviderApi = {
            _custom_: {
                loggedIn$: combineLatest([standardSetupPublicApi.authentication$, internalsPrivateScope$]).pipe(
                    map(([authentication, {privateScope}]) => {
                        const isPrivateScopeActive = Boolean(privateScope);
                        const isAuthenticationSessionActive = Boolean(authentication.hasSession?.call(authentication));
                        logger.verbose(JSON.stringify({isPrivateScopeActive, isAuthenticationSessionActive}));
                        return isPrivateScopeActive && isAuthenticationSessionActive;
                    }),
                    distinctUntilChanged(),
                ),
            },
        };

        logger.info("initialized");

        return providerApi;
    })();
};
