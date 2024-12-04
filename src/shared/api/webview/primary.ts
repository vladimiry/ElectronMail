import {ActionType, createWebViewApiService, ScanService} from "electron-rpc-api";

import {buildLoggerBundle} from "src/electron-preload/lib/util";
import type {DbAccountPk, Folder, FsDbAccount, Mail} from "src/shared/model/database";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import type {IpcMainServiceScan} from "src/shared/api/main-process";
import type {LoginFieldContainer} from "src/shared/model/container";
import type {Notifications} from "src/shared/model/account";
import type {ProtonClientSession} from "src/shared/model/proton";

const {Promise, Observable} = ActionType;

// TODO drop "{ accountIndex: number}" use
const PROTON_PRIMARY_IPC_WEBVIEW_API_DEFINITION = {
    ping: Promise<DeepReadonly<{accountIndex: number}>, {value: string}>(),
    buildDbPatch: Observable<
        DeepReadonly<DbAccountPk & {metadata: Readonly<FsDbAccount["metadata"]> | null} & {accountIndex: number}>,
        {progress: string}
    >(),
    throwErrorOnRateLimitedMethodCall: Promise<DeepReadonly<{accountIndex: number}>, void>(),
    selectMailOnline: Promise<
        DeepReadonly<
            {mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">; selectedFolderId: Folder["id"] | null} & {
                accountIndex: number;
            }
        >
    >(),
    fetchSingleMail: Promise<DeepReadonly<DbAccountPk & {mailPk: Mail["pk"]} & {accountIndex: number}>>(),
    deleteMessages: Promise<DeepReadonly<{messageIds: Array<Mail["id"]>} & {accountIndex: number}>>(),
    makeMailRead: Promise<DeepReadonly<{messageIds: Array<Mail["id"]>} & {accountIndex: number}>>(),
    setMailFolder: Promise<DeepReadonly<{folderId: Folder["id"]; messageIds: Array<Mail["id"]>} & {accountIndex: number}>>(),
    exportMailAttachments: Promise<DeepReadonly<DbAccountPk & {uuid: string; mailPk: Mail["pk"]} & {accountIndex: number}>>(),
    notification: Observable<
        DeepReadonly<LoginFieldContainer & {apiEndpointOriginSS: string; entryApiUrl: string; accountIndex: number}>,
        ProtonPrimaryNotificationOutput
    >(),
    resolveLiveProtonClientSession: ActionType.Promise<DeepReadonly<{accountIndex: number}>, ProtonClientSession | null>(),
    resolvedLiveSessionStoragePatch: ActionType.Promise<
        DeepReadonly<{accountIndex: number}>,
        IpcMainServiceScan["ApiImplReturns"]["resolvedSavedSessionStoragePatch"] | null
    >(),
} as const;

const channel = IPC_WEBVIEW_API_CHANNELS_MAP.primary.communication;

export const PROTON_PRIMARY_IPC_WEBVIEW_API = createWebViewApiService({
    apiDefinition: PROTON_PRIMARY_IPC_WEBVIEW_API_DEFINITION, // WARN referenced from "export const" to prevent "electron" injection
    channel,
    logger: buildLoggerBundle(`${__filename} [${channel}]`),
});

export type ProtonPrimaryApiScan = ScanService<typeof PROTON_PRIMARY_IPC_WEBVIEW_API>;

export type ProtonPrimaryApi = ProtonPrimaryApiScan["ApiClient"];

export type ProtonPrimaryNotificationOutput =
    & Notifications
    & Partial<{batchEntityUpdatesCounter: number}>;
