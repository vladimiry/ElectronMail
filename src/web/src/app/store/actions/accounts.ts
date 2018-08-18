import {ofType, unionize} from "unionize";

import {AccountConfig, Notifications} from "src/shared/model/account";
import {WebAccount, WebAccountProgress} from "src/web/src/app/model";

export const ACCOUNTS_ACTIONS = unionize({
        Activate: ofType<{ login: string }>(),
        NotificationPatch: ofType<{ login: string; notification: Partial<Notifications> }>(),
        PatchProgress: ofType<{ login: string; patch: WebAccountProgress; }>(),
        ToggleFetching: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void>; }>(),
        SetupNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void>; }>(),
        TryToLogin: ofType<{ account: WebAccount; webView: Electron.WebviewTag; password?: string; }>(),
        WireUpConfigs: ofType<{ accountConfigs: AccountConfig[] }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
