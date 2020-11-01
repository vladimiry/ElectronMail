import {ofType, unionize} from "@vladimiry/unionize";

import {AccountConfig} from "src/shared/model/account";
import {DbAccountPk, Folder, Mail} from "src/shared/model/database";
import {ProtonPrimaryApiScan} from "src/shared/api/webview/primary";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount, WebAccountProgress} from "src/web/browser-window/app/model";

export const ACCOUNTS_ACTIONS = unionize({
        Select: ofType<{ login: string }>(),
        DeSelect: ofType<{ login: string }>(),
        PatchProgress: ofType<{ login: string; patch: WebAccountProgress; optionalAccount?: boolean; }>(),
        Patch: ofType<{
            login: string;
            patch: NoExtraProps<Partial<{
                [K in keyof Pick<WebAccount,
                    | "webviewSrcValues"
                    | "notifications"
                    | "syncingActivated"
                    | "loginFilledOnce"
                    | "loginDelayedSeconds"
                    | "loginDelayedUntilSelected">]: Partial<WebAccount[K]>
            }>>;
            optionalAccount?: boolean;
        }>(),
        PatchDbExportProgress: ofType<{ pk: DbAccountPk; uuid: string; progress?: number }>(),
        ToggleDatabaseView: ofType<{ login: string; forced?: Pick<WebAccount, "databaseView"> }>(),
        ToggleSyncing: ofType<{ pk: DbAccountPk; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        Synced: ofType<{ pk: DbAccountPk }>(),
        SetupPrimaryNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        SetupCalendarNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        TryToLogin: ofType<{ account: WebAccount; webView: Electron.WebviewTag }>(),
        WireUpConfigs: ofType<DeepReadonly<{ accountConfigs: AccountConfig[] }>>(),
        PatchGlobalProgress: ofType<{ patch: State["globalProgress"] }>(),
        SelectMailOnline:
            ofType<{ pk: DbAccountPk } & StrictOmit<ProtonPrimaryApiScan["ApiImplArgs"]["selectMailOnline"][0], "zoneName">>(),
        DeleteMessages: ofType<{ pk: DbAccountPk } & StrictOmit<ProtonPrimaryApiScan["ApiImplArgs"]["deleteMessages"][0], "zoneName">>(),
        FetchSingleMail: ofType<{ pk: DbAccountPk } & { mailPk: Mail["pk"] }>(),
        MakeMailRead: ofType<{ pk: DbAccountPk } & { messageIds: Array<Mail["id"]> }>(),
        SetMailFolder: ofType<{ pk: DbAccountPk } & { folderId: Folder["id"]; messageIds: Array<Mail["id"]> }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
