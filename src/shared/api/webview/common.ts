import {ActionType} from "electron-rpc-api";

import {AccountType} from "src/shared/model/account";
import {DbAccountPk, Mail, MemoryDbAccount} from "src/shared/model/database";
import {LoginFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {PACKAGE_NAME} from "src/shared/constants";
import {ProtonmailApi} from "src/shared/api/webview/protonmail";
import {TutanotaApi} from "./tutanota";
import {ZoneApiParameter} from "src/shared/api/common";

export const channel = `${PACKAGE_NAME}:webview-api`;

const {Promise, Observable} = ActionType;

export type WebViewApi<T extends AccountType> = T extends "tutanota"
    ? TutanotaApi
    : T extends "protonmail"
        ? ProtonmailApi
        : never;

export function buildWebViewApiDefinition<T extends AccountType, NotificationOutput>() {
    return {
        ping: Promise<[ZoneApiParameter]>(),
        fillLogin: Promise<[LoginFieldContainer & ZoneApiParameter]>(),
        login: Promise<[LoginFieldContainer & PasswordFieldContainer & ZoneApiParameter]>(),
        login2fa: Promise<[{ secret: string } & ZoneApiParameter]>(),
        buildDbPatch: Observable<[DbAccountPk & { metadata: Readonly<MemoryDbAccount<T>["metadata"]> | null; } & ZoneApiParameter]>(),
        selectAccount: Promise<[{ databaseView?: boolean } & ZoneApiParameter]>(),
        selectMailOnline: Promise<[{
            pk: DbAccountPk;
            mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk">;
        } & ZoneApiParameter]>(),
        fetchSingleMail: Promise<[DbAccountPk & { mailPk: Mail["pk"] } & ZoneApiParameter]>(),
        notification: Observable<[{ entryUrl: string; entryApiUrl: string; } & ZoneApiParameter], NotificationOutput>(),
    };
}
