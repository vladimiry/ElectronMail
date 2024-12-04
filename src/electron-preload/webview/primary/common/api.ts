import {EMPTY, from, merge, Observable} from "rxjs";
import {ipcRenderer} from "electron";
import {map, mergeMap, switchMap, tap, throttleTime} from "rxjs/operators";

import {curryFunctionMembers} from "src/shared/util";
import {documentCookiesForCustomScheme} from "src/electron-preload/webview/lib/util";
import {dumpProtonSharedSession} from "src/electron-preload/webview/primary/shared-session";
import {getLocationHref} from "src/shared/util/web";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {LOGGER} from "src/electron-preload/lib/electron-exposure/logger";
import {ONE_SECOND_MS} from "src/shared/const";
import {PROTON_PRIMARY_COMMON_IPC_WEBVIEW_API, ProtonPrimaryCommonApi} from "src/shared/api/webview/primary-common";
import {ProviderApi} from "./provider-api";
import {resolveIpcMainApi} from "src/electron-preload/lib/util";

const resolveCookieSessionStoragePatch = (): IpcMainServiceScan["ApiImplReturns"]["resolvedSavedSessionStoragePatch"] => {
    // https://github.com/expo/tough-cookie-web-storage-store/blob/36a20183dad5f84f2c14ae87251737dbbeb2af88/WebStorageCookieStore.js#L12
    // TODO move "__cookieStore__" to external/reusable constant
    const sessionStorageCookieStoreKey = {"tough-cookie-web-storage-store": {storageCookieKey: "__cookieStore__"}} as const;
    const {"tough-cookie-web-storage-store": {storageCookieKey}} = sessionStorageCookieStoreKey;
    const {__cookieStore__} = {[storageCookieKey]: window.sessionStorage.getItem(storageCookieKey)};
    return __cookieStore__ ? {__cookieStore__} : null;
};

export const registerApi = (
    providerApi: ProviderApi,
    _logger: typeof LOGGER,
): void => {
    const endpoints: ProtonPrimaryCommonApi = {
        async resolveLiveProtonClientSession({accountIndex}) {
            _logger.info(nameof(endpoints.resolveLiveProtonClientSession), accountIndex);
            return dumpProtonSharedSession();
        },

        async resolvedLiveSessionStoragePatch({accountIndex}) {
            _logger.info(nameof(endpoints.resolvedLiveSessionStoragePatch), accountIndex);
            return resolveCookieSessionStoragePatch();
        },

        notification({login, apiEndpointOrigin, accountIndex}) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.notification), accountIndex);

            logger.info();

            type LoggedInOutput = Required<Pick<Unpacked<ReturnType<ProtonPrimaryCommonApi["notification"]>>, "loggedIn">>;

            const observables: [Observable<LoggedInOutput>] = [
                providerApi._custom_.loggedIn$.pipe(map((loggedIn) => ({loggedIn}))),
            ];
            const ipcMain = resolveIpcMainApi({logger});

            return merge(
                merge(...observables).pipe(tap((notification) => logger.verbose(JSON.stringify({notification})))),
                documentCookiesForCustomScheme.setNotification$.pipe(
                    throttleTime(ONE_SECOND_MS / 4),
                    mergeMap(() => {
                        const sessionStorageItem = resolveCookieSessionStoragePatch();
                        return sessionStorageItem
                            ? (from(ipcMain("saveSessionStoragePatch")({login, apiEndpointOrigin, sessionStorageItem}))
                                .pipe(switchMap(() => EMPTY)))
                            : EMPTY;
                    }),
                ),
            );
        },
    };

    PROTON_PRIMARY_COMMON_IPC_WEBVIEW_API.register(endpoints, {logger: _logger});
    ipcRenderer.sendToHost(IPC_WEBVIEW_API_CHANNELS_MAP.common.registered);
    _logger.verbose(`api registered, url: ${getLocationHref()}`);
};
