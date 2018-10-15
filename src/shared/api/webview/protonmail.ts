import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {CommonWebViewApi} from "src/shared/api/webview/common";
import {MailPasswordFieldContainer} from "src/shared/model/container";
import {NotificationsProtonmail} from "src/shared/model/account";
import {ZoneApiParameter} from "src/shared/api/common";
import {channel} from "./common";

export type ProtonmailNotificationOutput = Partial<NotificationsProtonmail> & Partial<{ batchEntityUpdatesCounter: number }>;

export interface ProtonmailApi extends CommonWebViewApi<"protonmail"> {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, ProtonmailNotificationOutput>;
    unlock: ApiMethod<MailPasswordFieldContainer & ZoneApiParameter, null>;
}

export const PROTONMAIL_IPC_WEBVIEW_API = new WebViewApiService<ProtonmailApi>({channel});
