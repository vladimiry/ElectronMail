import {ActionType, createWebViewApiService, ScanService} from "electron-rpc-api";

import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {DbAccountPk, Folder, FsDbAccount, Mail} from "src/shared/model/database";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {LoginFieldContainer, MailPasswordFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {Notifications} from "src/shared/model/account";
import {PACKAGE_NAME} from "src/shared/constants";
import {ProtonClientSession} from "src/shared/model/proton";

const {Promise, Observable} = ActionType;

// TODO drop "{ accountIndex: number}" use
export const PROTON_PRIMARY_IPC_WEBVIEW_API_DEFINITION = {
    ping:
        Promise<DeepReadonly<{ accountIndex: number }>>(),
    fillLogin:
        Promise<DeepReadonly<LoginFieldContainer & { accountIndex: number }>>(),
    login:
        Promise<DeepReadonly<LoginFieldContainer & PasswordFieldContainer & { accountIndex: number }>>(),
    login2fa:
        Promise<DeepReadonly<{ secret: string } & { accountIndex: number }>>(),
    buildDbPatch:
        Observable<DeepReadonly<DbAccountPk & { metadata: Readonly<FsDbAccount["metadata"]> | null } & { accountIndex: number }>,
            void | "timeoutRelease">(),
    selectMailOnline:
        Promise<DeepReadonly<{
            mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">
            selectedFolderId: Folder["id"] | null
        } & { accountIndex: number }>>(),
    fetchSingleMail:
        Promise<DeepReadonly<DbAccountPk & { mailPk: Mail["pk"] } & { accountIndex: number }>>(),
    deleteMessages:
        Promise<DeepReadonly<{ messageIds: Array<Mail["id"]> } & { accountIndex: number }>>(),
    makeMailRead:
        Promise<DeepReadonly<{ messageIds: Array<Mail["id"]> } & { accountIndex: number }>>(),
    setMailFolder:
        Promise<DeepReadonly<{ folderId: Folder["id"]; messageIds: Array<Mail["id"]> } & { accountIndex: number }>>(),
    exportMailAttachments:
        Promise<DeepReadonly<DbAccountPk & { uuid: string; mailPk: Mail["pk"] } & { accountIndex: number }>>(),
    notification:
        Observable<DeepReadonly<LoginFieldContainer & { entryUrl: string; entryApiUrl: string } & { accountIndex: number }>,
            ProtonPrimaryNotificationOutput>(),
    unlock:
        ActionType.Promise<MailPasswordFieldContainer & { accountIndex: number }>(),
    resolveLiveProtonClientSession: ActionType
        .Promise<DeepReadonly<{ accountIndex: number }>, ProtonClientSession | null>(),
    resolvedLiveSessionStoragePatch: ActionType
        .Promise<DeepReadonly<{ accountIndex: number }>, IpcMainServiceScan["ApiImplReturns"]["resolvedSavedSessionStoragePatch"] | null>(),
} as const;

export const PROTON_PRIMARY_IPC_WEBVIEW_API = createWebViewApiService({
    apiDefinition: PROTON_PRIMARY_IPC_WEBVIEW_API_DEFINITION,
    channel: `${PACKAGE_NAME}:webview-api:primary`,
    logger: buildLoggerBundle(`${__filename} [webview-api:primary]`),
});

export type ProtonPrimaryApiScan = ScanService<typeof PROTON_PRIMARY_IPC_WEBVIEW_API>;

export type ProtonPrimaryApi = ProtonPrimaryApiScan["ApiClient"];

export type ProtonPrimaryNotificationOutput = Partial<StrictOmit<Notifications, "loggedInCalendar">>
    & Partial<{ batchEntityUpdatesCounter: number }>;
