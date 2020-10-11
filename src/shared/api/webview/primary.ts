import {ActionType, ScanService, createWebViewApiService} from "electron-rpc-api";

import {DbAccountPk, Folder, FsDbAccount, Mail} from "src/shared/model/database";
import {LoginFieldContainer, MailPasswordFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {Notifications} from "src/shared/model/account";
import {PACKAGE_NAME} from "src/shared/constants";
import {ProtonClientSession} from "src/shared/model/proton";
import {ZoneApiParameter} from "src/shared/api/common";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

const {Promise, Observable} = ActionType;

// TODO drop "ZoneApiParameter" use
export const PROTONMAIL_IPC_WEBVIEW_API_DEFINITION = {
    ping:
        Promise<DeepReadonly<ZoneApiParameter>>(),
    fillLogin:
        Promise<DeepReadonly<LoginFieldContainer & ZoneApiParameter>>(),
    login:
        Promise<DeepReadonly<LoginFieldContainer & PasswordFieldContainer & ZoneApiParameter>>(),
    login2fa:
        Promise<DeepReadonly<{ secret: string } & ZoneApiParameter>>(),
    buildDbPatch:
        Observable<DeepReadonly<DbAccountPk & { metadata: Readonly<FsDbAccount["metadata"]> | null } & ZoneApiParameter>>(),
    selectMailOnline:
        Promise<DeepReadonly<{
            pk: DbAccountPk
            mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">
            selectedFolderId: Folder["id"] | null
        } & ZoneApiParameter>>(),
    fetchSingleMail:
        Promise<DeepReadonly<DbAccountPk & { mailPk: Mail["pk"] } & ZoneApiParameter>>(),
    makeMailRead:
        Promise<DeepReadonly<DbAccountPk & { messageIds: Array<Mail["id"]> } & ZoneApiParameter>>(),
    setMailFolder:
        Promise<DeepReadonly<DbAccountPk & { folderId: Folder["id"]; messageIds: Array<Mail["id"]> } & ZoneApiParameter>>(),
    exportMailAttachments:
        Promise<DeepReadonly<DbAccountPk & { uuid: string; mailPk: Mail["pk"] } & ZoneApiParameter>>(),
    notification:
        Observable<DeepReadonly<{ entryUrl: string; entryApiUrl: string } & ZoneApiParameter>, ProtonNotificationOutput>(),
    unlock:
        ActionType.Promise<MailPasswordFieldContainer & ZoneApiParameter>(),
    resolveSavedProtonClientSession:
        ActionType.Promise<DeepReadonly<ZoneApiParameter>, ProtonClientSession | null>(),
} as const;

export const PROTONMAIL_IPC_WEBVIEW_API = createWebViewApiService({
    channel: `${PACKAGE_NAME}:webview-api`,
    apiDefinition: PROTONMAIL_IPC_WEBVIEW_API_DEFINITION,
    logger: buildLoggerBundle("[IPC_WEBVIEW_API:protonmail]"),
});

export type ProtonApiScan = ScanService<typeof PROTONMAIL_IPC_WEBVIEW_API>;

export type ProtonApi = ProtonApiScan["ApiClient"];

export type ProtonNotificationOutput = Partial<Notifications> & Partial<{ batchEntityUpdatesCounter: number }>;
