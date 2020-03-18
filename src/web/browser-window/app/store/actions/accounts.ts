import {ofType, unionize} from "@vladimiry/unionize";

import {AccountConfig} from "src/shared/model/account";
import {DbAccountPk, Mail} from "src/shared/model/database";
import {MailsBundleKey} from "src/web/browser-window/app/store/reducers/db-view";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount, WebAccountProgress} from "src/web/browser-window/app/model";

export const ACCOUNTS_ACTIONS = unionize({
        Activate: ofType<{ login: string }>(),
        DeActivate: ofType<{ login: string }>(),
        PatchProgress: ofType<{ login: string; patch: WebAccountProgress }>(),
        Patch: ofType<{
            login: string;
            patch: Partial<{
                [k in keyof Pick<WebAccount,
                    | "notifications"
                    | "syncingActivated"
                    | "loginFilledOnce"
                    | "loginDelayedSeconds"
                    | "loginDelayedUntilSelected">]: Partial<WebAccount[k]>
            }>;
            ignoreNoAccount?: boolean;
        }>(),
        ToggleDatabaseView: ofType<{ login: string; forced?: Pick<WebAccount, "databaseView"> }>(),
        ToggleSyncing: ofType<{ pk: DbAccountPk; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        SetupNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        TryToLogin: ofType<{ account: WebAccount; webView: Electron.WebviewTag }>(),
        WireUpConfigs: ofType<{ accountConfigs: AccountConfig[] }>(),
        PatchGlobalProgress: ofType<{ patch: State["globalProgress"] }>(),
        SelectMailOnline: ofType<{ pk: DbAccountPk; mail: Pick<Mail, "id" | "mailFolderIds" | "conversationEntryPk"> }>(),
        FetchSingleMailSetParams: ofType<{ pk: DbAccountPk }
            & Partial<Pick<Exclude<WebAccount["fetchSingleMailParams"], null>, "mailPk">>>(),
        FetchSingleMail: ofType<{ account: WebAccount; webView: Electron.WebviewTag }
            & Pick<Exclude<WebAccount["fetchSingleMailParams"], null>, "mailPk">>(),
        MakeMailReadSetParams: ofType<{ pk: DbAccountPk; mailsBundleKey: MailsBundleKey }
            & Partial<Pick<Exclude<WebAccount["makeReadMailParams"], null>, "messageIds">>>(),
        MakeMailRead: ofType<{ account: WebAccount; webView: Electron.WebviewTag; mailsBundleKey: MailsBundleKey }
            & Pick<Exclude<WebAccount["makeReadMailParams"], null>, "messageIds">>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
