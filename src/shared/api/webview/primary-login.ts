import {ActionType, createWebViewApiService, ScanService} from "electron-rpc-api";

import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";

const channel = IPC_WEBVIEW_API_CHANNELS_MAP["primary-login"].communication;

export const PROTON_PRIMARY_LOGIN_IPC_WEBVIEW_API = createWebViewApiService({
    // TODO drop "{ accountIndex: number}" use
    apiDefinition: {
        fillLogin: ActionType.Promise<DeepReadonly<{ accountIndex: number, login: string }>>(),
    } as const,
    channel,
    logger: buildLoggerBundle(`${__filename} [${channel}]`),
});

export type ProtonPrimaryApiScan = ScanService<typeof PROTON_PRIMARY_LOGIN_IPC_WEBVIEW_API>;

export type ProtonPrimaryLoginApi = ProtonPrimaryApiScan["ApiClient"];
