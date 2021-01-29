import {ofType, unionize} from "@vladimiry/unionize";

import {AccountConfig} from "src/shared/model/account";
import {Folder, Mail} from "src/shared/model/database";
import {ProtonPrimaryApiScan} from "src/shared/api/webview/primary";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount, WebAccountPk, WebAccountProgress} from "src/web/browser-window/app/model";

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
        PatchDbExportProgress: ofType<{ pk: WebAccountPk; uuid: string; progress?: number }>(),
        ToggleDatabaseView: ofType<{ login: string; forced?: Pick<WebAccount, "databaseView"> }>(),
        ToggleSyncing:
            ofType<{ pk: WebAccountPk; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        Synced: ofType<{ pk: WebAccountPk }>(),
        SetupPrimaryNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        SetupCalendarNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        TryToLogin: ofType<{ account: WebAccount; webView: Electron.WebviewTag }>(),
        WireUpConfigs: ofType<DeepReadonly<{ accountConfigs: AccountConfig[] }>>(),
        PatchGlobalProgress: ofType<{ patch: State["globalProgress"] }>(),
        SelectMailOnline:
            ofType<{ pk: WebAccountPk } & StrictOmit<ProtonPrimaryApiScan["ApiImplArgs"]["selectMailOnline"][0], "accountIndex">>(),
        DeleteMessages:
            ofType<{ pk: WebAccountPk } & StrictOmit<ProtonPrimaryApiScan["ApiImplArgs"]["deleteMessages"][0], "accountIndex">>(),
        FetchSingleMail: ofType<{ pk: WebAccountPk } & { mailPk: Mail["pk"] }>(),
        MakeMailRead: ofType<{ pk: WebAccountPk } & { messageIds: Array<Mail["id"]> }>(),
        SetMailFolder: ofType<{ pk: WebAccountPk } & { folderId: Folder["id"]; messageIds: Array<Mail["id"]> }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
