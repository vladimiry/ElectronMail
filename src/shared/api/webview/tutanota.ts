import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {BatchEntityUpdatesDbPatch, ZoneApiParameter} from "src/shared/api/common";
import {CommonApi} from "src/shared/api/webview/common";
import {DbContent} from "src/shared/model/database";
import {NotificationsTutanota} from "src/shared/model/account";
import {channel} from "./common";

type Metadata = DbContent<"tutanota">["metadata"];

export type TutanotaNotificationOutput = Partial<NotificationsTutanota> & Partial<{ batchEntityUpdatesCounter: number }>;

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, TutanotaNotificationOutput>;
    buildBatchEntityUpdatesDbPatch: ApiMethod<Metadata & ZoneApiParameter,
        BatchEntityUpdatesDbPatch & { metadata: Required<Pick<Metadata, "groupEntityEventBatchIds">> }>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
