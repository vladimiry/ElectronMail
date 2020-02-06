import {ActionType, ScanService, createWebViewApiService} from "electron-rpc-api";

import {DbAccountPk, FsDbAccount, Mail} from "src/shared/model/database";
import {LoginFieldContainer, MailPasswordFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {Notifications} from "src/shared/model/account";
import {PACKAGE_NAME} from "src/shared/constants";
import {ProtonClientSession} from "src/shared/model/proton";
import {ReadonlyDeep} from "type-fest";
import {ZoneApiParameter} from "src/shared/api/common";

const {Promise, SubscribableLike} = ActionType;

export type ProtonApiScan = ScanService<typeof PROTONMAIL_IPC_WEBVIEW_API>;

export type ProtonApi = ProtonApiScan["ApiClient"];

export type ProtonNotificationOutput = Partial<Notifications> & Partial<{ batchEntityUpdatesCounter: number }>;

export const PROTONMAIL_IPC_WEBVIEW_API_DEFINITION = {
    ping:
        Promise<ReadonlyDeep<ZoneApiParameter>>(),
    fillLogin:
        Promise<ReadonlyDeep<LoginFieldContainer & ZoneApiParameter>>(),
    login:
        Promise<ReadonlyDeep<LoginFieldContainer & PasswordFieldContainer & ZoneApiParameter>>(),
    login2fa:
        Promise<ReadonlyDeep<{ secret: string } & ZoneApiParameter>>(),
    buildDbPatch:
        SubscribableLike<ReadonlyDeep<DbAccountPk & { metadata: Readonly<FsDbAccount["metadata"]> | null; } & ZoneApiParameter>>(),
    selectMailOnline:
        Promise<ReadonlyDeep<{
            pk: DbAccountPk; mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">;
        } & ZoneApiParameter>>(),
    fetchSingleMail:
        Promise<ReadonlyDeep<DbAccountPk & { mailPk: Mail["pk"] } & ZoneApiParameter>>(),
    makeRead:
        Promise<ReadonlyDeep<DbAccountPk & { messageIds: string[]; } & ZoneApiParameter>>(),
    notification:
        SubscribableLike<ReadonlyDeep<{ entryUrl: string; entryApiUrl: string; } & ZoneApiParameter>, ProtonNotificationOutput>(),
    unlock:
        ActionType.Promise<MailPasswordFieldContainer & ZoneApiParameter>(),
    resolveSavedProtonClientSession:
        ActionType.Promise<ReadonlyDeep<ZoneApiParameter>, ProtonClientSession | null>(),
} as const;

export const PROTONMAIL_IPC_WEBVIEW_API = createWebViewApiService({
    channel: `${PACKAGE_NAME}:webview-api`,
    apiDefinition: PROTONMAIL_IPC_WEBVIEW_API_DEFINITION,
    // logger: buildLoggerBundle("[IPC_WEBVIEW_API:protonmail]"),
});
