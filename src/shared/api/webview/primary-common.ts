import {ActionType, createWebViewApiService, ScanService} from "electron-rpc-api";

import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "./const";
import type {IpcMainServiceScan} from "src/shared/api/main-process";
import type {LoginFieldContainer} from "src/shared/model/container";
import type {Notifications} from "src/shared/model/account";
import type {ProtonClientSession} from "src/shared/model/proton";

// TODO drop "{ accountIndex: number}" use
const apiDefinition = {
    notification: ActionType.Observable<
        DeepReadonly<LoginFieldContainer & {apiEndpointOrigin: string; accountIndex: number}>,
        Partial<Pick<Notifications, "loggedIn">>
    >(),
    resolveLiveProtonClientSession: ActionType.Promise<
        DeepReadonly<{accountIndex: number}>,
        ProtonClientSession | null
    >(),
    resolvedLiveSessionStoragePatch: ActionType.Promise<
        DeepReadonly<{accountIndex: number}>,
        IpcMainServiceScan["ApiImplReturns"]["resolvedSavedSessionStoragePatch"] | null
    >(),
} as const;

const channel = IPC_WEBVIEW_API_CHANNELS_MAP.common.communication;

export const PROTON_PRIMARY_COMMON_IPC_WEBVIEW_API = createWebViewApiService({
    apiDefinition, // WARN referenced from "export const" to prevent "electron" injection
    channel,
    logger: buildLoggerBundle(`${__filename} [${channel}]`),
});

export type ProtonPrimaryCommonApiScan = ScanService<typeof PROTON_PRIMARY_COMMON_IPC_WEBVIEW_API>;

export type ProtonPrimaryCommonApi = ProtonPrimaryCommonApiScan["ApiClient"];
