import {ofType, unionize} from "unionize";

import {AccountConfig, WebAccount, WebAccountPageType, WebAccountProgress} from "_@shared/model/account";
import {AccountNotificationOutput} from "_@shared/api/webview/notification-output";

export const ACCOUNTS_ACTIONS = unionize({
        AccountNotification: ofType<{ accountConfig: AccountConfig; notification: AccountNotificationOutput }>(),
        ActivateAccount: ofType<{ login: string }>(),
        DestroyAccount: ofType<{ account: WebAccount }>(),
        Login: ofType<{ pageType: WebAccountPageType; webView: Electron.WebviewTag; account: WebAccount; password: string; }>(),
        PageLoadingEnd: ofType<{ account: WebAccount; webView: Electron.WebviewTag; }>(),
        PageLoadingStart: ofType<{ account: WebAccount; webView: Electron.WebviewTag; unSubscribeOn: Promise<any>; }>(),
        PatchAccountProgress: ofType<{ login: string; patch: WebAccountProgress; }>(),
        Reset: ofType<{}>(),
        SyncAccountsConfigs: ofType<{ accountConfigs: AccountConfig[] }>(),
        UpdateOverlayIcon: ofType<{ count: number, dataURL?: string }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "accounts:",
    },
);
