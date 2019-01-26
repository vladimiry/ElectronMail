import {ofType, unionize} from "@vladimiry/unionize";

import {AccountConfig} from "src/shared/model/account";
import {DbAccountPk} from "src/shared/model/database";
import {State} from "src/web/src/app/store/reducers/accounts";
import {WebAccount, WebAccountProgress} from "src/web/src/app/model";

export const ACCOUNTS_ACTIONS = unionize({
        Activate: ofType<{ login: string }>(),
        PatchProgress: ofType<{ login: string; patch: WebAccountProgress; }>(),
        Patch: ofType<{
            login: string;
            // TODO apply "deep partial" transformation instead of explicit individual per-field partitioning
            patch: Partial<{
                notifications: Partial<WebAccount["notifications"]>,
                syncingActivated: Partial<WebAccount["syncingActivated"]>,
                loginFilledOnce: Partial<WebAccount["loginFilledOnce"]>,
                indexing: Partial<WebAccount["indexing"]>,
            }>;
            ignoreNoAccount?: boolean
        }>(),
        ToggleDatabaseView: ofType<{ login: string; forced?: Pick<WebAccount, "databaseView"> }>(),
        ToggleSyncing: ofType<{ pk: DbAccountPk; webView: Electron.WebviewTag; finishPromise: Promise<void>; }>(),
        SetupNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void>; }>(),
        TryToLogin: ofType<{ account: WebAccount; webView: Electron.WebviewTag; password?: string; }>(),
        WireUpConfigs: ofType<{ accountConfigs: AccountConfig[] }>(),
        PatchGlobalProgress: ofType<{ patch: State["progress"]; }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
