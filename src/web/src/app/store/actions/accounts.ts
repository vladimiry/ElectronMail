import {ofType, unionize} from "unionize";

import {AccountConfig, AccountNotificationType, AccountProgress, WebAccount} from "_@shared/model/account";

export const ACCOUNTS_ACTIONS = unionize({
        FetchMessages: ofType<{ account: WebAccount; webView: Electron.WebviewTag; }>(),
        Activate: ofType<{ login: string }>(),
        Login: ofType<{ account: WebAccount; webView: Electron.WebviewTag; password?: string; }>(),
        NotificationPatch: ofType<{ login: string; notification: Partial<AccountNotificationType> }>(),
        PatchProgress: ofType<{ login: string; patch: AccountProgress; }>(),
        Reset: ofType<{}>(),
        SetupNotifications: ofType<{ account: WebAccount; webView: Electron.WebviewTag; unSubscribeOn: Promise<any>; }>(),
        UpdateOverlayIcon: ofType<{ count: number, dataURL?: string }>(),
        WireUpConfigs: ofType<{ accountConfigs: AccountConfig[] }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
