import {ActionType, createWebViewApiService, ScanService} from "electron-rpc-api";

import {buildLoggerBundle} from "src/electron-preload/lib/util";
import type {DbAccountPk, Folder, FsDbAccount, Mail} from "src/shared/model/database";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import type {Notifications} from "src/shared/model/account";

// TODO drop "{ accountIndex: number}" use
const apiDefinition = {
    notification: ActionType.Observable<
        DeepReadonly<{entryApiUrl: string; accountIndex: number}>,
        Partial<Notifications & {batchEntityUpdatesCounter: number}>
    >(),
    buildDbPatch: ActionType.Observable<
        DeepReadonly<DbAccountPk & {metadata: Readonly<FsDbAccount["metadata"]> | null} & {accountIndex: number}>,
        {progress: string}
    >(),
    throwErrorOnRateLimitedMethodCall: ActionType.Promise<
        DeepReadonly<{accountIndex: number}>,
        void
    >(),
    selectMailOnline: ActionType.Promise<
        DeepReadonly<
            {mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">; selectedFolderId: Folder["id"] | null} & {
                accountIndex: number;
            }
        >
    >(),
    fetchSingleMail: ActionType.Promise<
        DeepReadonly<DbAccountPk & {mailPk: Mail["pk"]} & {accountIndex: number}>
    >(),
    deleteMessages: ActionType.Promise<
        DeepReadonly<{messageIds: Array<Mail["id"]>} & {accountIndex: number}>
    >(),
    makeMailRead: ActionType.Promise<
        DeepReadonly<{messageIds: Array<Mail["id"]>} & {accountIndex: number}>
    >(),
    setMailFolder: ActionType.Promise<
        DeepReadonly<{folderId: Folder["id"]; messageIds: Array<Mail["id"]>} & {accountIndex: number}>
    >(),
    exportMailAttachments: ActionType.Promise<
        DeepReadonly<DbAccountPk & {uuid: string; mailPk: Mail["pk"]} & {accountIndex: number}>
    >(),
} as const;

const channel = IPC_WEBVIEW_API_CHANNELS_MAP.mail.communication;

export const PROTON_PRIMARY_MAIL_IPC_WEBVIEW_API = createWebViewApiService({
    apiDefinition, // WARN referenced from "export const" to prevent "electron" injection
    channel,
    logger: buildLoggerBundle(`${__filename} [${channel}]`),
});

export type ProtonPrimaryMailApiScan = ScanService<typeof PROTON_PRIMARY_MAIL_IPC_WEBVIEW_API>;

export type ProtonPrimaryMailApi = ProtonPrimaryMailApiScan["ApiClient"];
