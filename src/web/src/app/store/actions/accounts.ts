import {ofType, unionize} from "unionize";

import {AccountConfig, AccountNotificationType, AccountProgress, WebAccount} from "_@shared/model/account";

export const ACCOUNTS_ACTIONS = unionize({
        Activate: ofType<{ login: string }>(),
        FetchMessages: ofType<{ account: WebAccount; webView: Electron.WebviewTag; }>(),
        NotificationPatch: ofType<{ login: string; notification: Partial<AccountNotificationType> }>(),
        PatchProgress: ofType<{ login: string; patch: AccountProgress; }>(),
        Reset: ofType<{}>(),
        SetupNotificationChannel: ofType<{ account: WebAccount; webView: Electron.WebviewTag; unSubscribeOn: Promise<any>; }>(),
        TryToLogin: ofType<{ account: WebAccount; webView: Electron.WebviewTag; password?: string; }>(),
        WireUpConfigs: ofType<{ accountConfigs: AccountConfig[] }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
