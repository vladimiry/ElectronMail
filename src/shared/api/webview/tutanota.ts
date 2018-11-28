import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {CommonWebViewApi} from "src/shared/api/webview/common";
import {NotificationsTutanota} from "src/shared/model/account";
import {ZoneApiParameter} from "src/shared/api/common";
import {channel} from "./common";

export type TutanotaNotificationOutput = Partial<NotificationsTutanota> & Partial<{ batchEntityUpdatesCounter: number }>;

export interface TutanotaApi extends CommonWebViewApi<"tutanota"> {
    notification: ApiMethod<{ entryUrl: string; entryApiUrl: string; } & ZoneApiParameter, TutanotaNotificationOutput>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
