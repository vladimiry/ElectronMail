import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {channel, FetchMessagesInput, FetchMessagesOutput} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {NotificationsTutanota} from "src/shared/model/account";
import {ZoneApiParameter} from "src/shared/api/common";

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, Partial<NotificationsTutanota>>;
    fetchMessages: ApiMethod<FetchMessagesInput & ZoneApiParameter, FetchMessagesOutput>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
