import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {BatchEntityUpdatesDbPatch, ZoneApiParameter} from "src/shared/api/common";
import {channel} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {NotificationsTutanota} from "src/shared/model/account";

// TODO figure why tslint detects below import as unused
// tslint:disable-next-line:no-unused-variable
import {DbContent, Folder, Mail} from "src/shared/model/database";

type Metadata = DbContent<"tutanota">["metadata"];

export type TutanotaNotificationOutput = Partial<NotificationsTutanota> & Partial<{ batchEntityUpdatesCounter: number }>;

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, TutanotaNotificationOutput>;
    buildBatchEntityUpdatesDbPatch: ApiMethod<Metadata & ZoneApiParameter,
        BatchEntityUpdatesDbPatch & { metadata: Required<Pick<Metadata, "groupEntityEventBatchIds">> }>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
