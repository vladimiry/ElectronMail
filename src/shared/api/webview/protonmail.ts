import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {AccountNotifications, WebAccountProtonmail} from "src/shared/model/account";
import {channel} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {MailPasswordFieldContainer} from "src/shared/model/container";
import {ZoneApiParameter} from "src/shared/api/common";

export interface ProtonmailApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, Partial<AccountNotifications<WebAccountProtonmail>>>;
    unlock: ApiMethod<MailPasswordFieldContainer & ZoneApiParameter, never>;
}

export const PROTONMAIL_IPC_WEBVIEW_API = new WebViewApiService<ProtonmailApi>({channel});
