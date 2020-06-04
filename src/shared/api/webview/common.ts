import {ActionType} from "electron-rpc-api";

import {AccountType} from "src/shared/model/account";
import {DbAccountPk, FsDbAccount, Mail} from "src/shared/model/database";
import {LoginFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {PACKAGE_NAME} from "src/shared/constants";
import {ZoneApiParameter} from "src/shared/api/common";

export const channel = `${PACKAGE_NAME}:webview-api`;

const {Promise, Observable} = ActionType;

export function buildWebViewApiDefinition<T extends AccountType, NotificationOutput>() {
    return {
        ping:
            Promise<DeepReadonly<ZoneApiParameter>>(),
        fillLogin:
            Promise<DeepReadonly<LoginFieldContainer & ZoneApiParameter>>(),
        login:
            Promise<DeepReadonly<LoginFieldContainer & PasswordFieldContainer & ZoneApiParameter>>(),
        login2fa:
            Promise<DeepReadonly<{ secret: string } & ZoneApiParameter>>(),
        buildDbPatch:
            Observable<DeepReadonly<DbAccountPk & { metadata: Readonly<FsDbAccount<T>["metadata"]> | null; } & ZoneApiParameter>>(),
        selectAccount:
            Promise<DeepReadonly<{ databaseView?: boolean } & ZoneApiParameter>>(),
        selectMailOnline:
            Promise<DeepReadonly<{
                pk: DbAccountPk; mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">;
            } & ZoneApiParameter>>(),
        fetchSingleMail:
            Promise<DeepReadonly<DbAccountPk & { mailPk: Mail["pk"] } & ZoneApiParameter>>(),
        makeRead:
            Promise<DeepReadonly<DbAccountPk & { messageIds: string[]; } & ZoneApiParameter>>(),
        notification:
            Observable<DeepReadonly<{ entryUrl: string; entryApiUrl: string; } & ZoneApiParameter>, NotificationOutput>(),
    };
}
