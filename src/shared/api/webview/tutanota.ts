import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {AccountNotifications, WebAccountTutanota} from "src/shared/model/account";
import {channel} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {File, MailBody} from "src/electron-preload/webview/tutanota/lib/rest/model/entity";
import {Mail} from "src/electron-preload/webview/tutanota/lib/rest/model";
import {Timestamp} from "src/shared/types";

export interface TutanotaApiFetchMessagesInput {
    newestStoredTimestamp?: Timestamp;
}

export interface TutanotaApiFetchMessagesOutput {
    mailItem: { mail: Mail, body: MailBody, files: File[] };
}

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string }, AccountNotifications<WebAccountTutanota>>;
    fetchMessages: ApiMethod<TutanotaApiFetchMessagesInput, TutanotaApiFetchMessagesOutput>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
