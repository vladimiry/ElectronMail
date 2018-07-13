import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {AccountNotifications, WebAccountProtonmail} from "src/shared/model/account";
import {channel} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {MailPasswordFieldContainer} from "src/shared/model/container";

export interface ProtonmailApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string }, AccountNotifications<WebAccountProtonmail>>;
    unlock: ApiMethod<MailPasswordFieldContainer, never>;
}

export const PROTONMAIL_IPC_WEBVIEW_API = new WebViewApiService<ProtonmailApi>({channel});
