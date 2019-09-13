import {ActionType} from "electron-rpc-api";

import {AccountType} from "src/shared/model/account";
import {DbAccountPk, FsDbAccount, Mail} from "src/shared/model/database";
import {LoginFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {PACKAGE_NAME} from "src/shared/constants";
import {ReadonlyDeep} from "type-fest";
import {ZoneApiParameter} from "src/shared/api/common";

export const channel = `${PACKAGE_NAME}:webview-api`;

const {Promise, Observable} = ActionType;

export function buildWebViewApiDefinition<T extends AccountType, NotificationOutput>() {
    return {
        ping:
            Promise<ReadonlyDeep<ZoneApiParameter>>(),
        fillLogin:
            Promise<ReadonlyDeep<LoginFieldContainer & ZoneApiParameter>>(),
        login:
            Promise<ReadonlyDeep<LoginFieldContainer & PasswordFieldContainer & ZoneApiParameter>>(),
        login2fa:
            Promise<ReadonlyDeep<{ secret: string } & ZoneApiParameter>>(),
        buildDbPatch:
            Observable<ReadonlyDeep<DbAccountPk & { metadata: Readonly<FsDbAccount<T>["metadata"]> | null; } & ZoneApiParameter>>(),
        selectAccount:
            Promise<ReadonlyDeep<{ databaseView?: boolean } & ZoneApiParameter>>(),
        selectMailOnline:
            Promise<ReadonlyDeep<{
                pk: DbAccountPk; mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">;
            } & ZoneApiParameter>>(),
        fetchSingleMail:
            Promise<ReadonlyDeep<DbAccountPk & { mailPk: Mail["pk"] } & ZoneApiParameter>>(),
        makeRead:
            Promise<ReadonlyDeep<DbAccountPk & { messageIds: string[]; } & ZoneApiParameter>>(),
        notification:
            Observable<ReadonlyDeep<{ entryUrl: string; entryApiUrl: string; } & ZoneApiParameter>, NotificationOutput>(),
    };
}
