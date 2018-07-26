import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {AccountConfig, AccountNotifications, AccountType, WebAccountTutanota} from "src/shared/model/account";
import {channel} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {Mail} from "src/shared/model/database";
import {Omit, Timestamp} from "src/shared/types";
import {ZoneApiParameter} from "src/shared/api/common";

export interface TutanotaApiFetchMessagesInput {
    type: AccountType;
    login: AccountConfig["login"];
    newestStoredTimestamp?: Timestamp;
}

export interface TutanotaApiFetchMessagesOutput {
    mail: Omit<Mail, "pk">;
}

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, Partial<AccountNotifications<WebAccountTutanota>>>;
    fetchMessages: ApiMethod<TutanotaApiFetchMessagesInput & ZoneApiParameter, TutanotaApiFetchMessagesOutput>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
