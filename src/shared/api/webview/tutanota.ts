import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {AccountConfig, AccountNotifications, AccountType, WebAccountTutanota} from "src/shared/model/account";
import {channel} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {Mail} from "src/shared/model/database";
import {Omit, Timestamp} from "src/shared/types";

export interface TutanotaApiFetchMessagesInput {
    type: AccountType;
    login: AccountConfig["login"];
    newestStoredTimestamp?: Timestamp;
}

export interface TutanotaApiFetchMessagesOutput {
    mail: Omit<Mail, "pk">;
}

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string }, AccountNotifications<WebAccountTutanota>>;
    fetchMessages: ApiMethod<TutanotaApiFetchMessagesInput, TutanotaApiFetchMessagesOutput>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
