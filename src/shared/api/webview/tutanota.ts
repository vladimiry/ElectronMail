import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {BatchEntityUpdatesDbPatch, ZoneApiParameter} from "src/shared/api/common";
import {CommonApi} from "src/shared/api/webview/common";
import {MemoryDbAccount} from "src/shared/model/database";
import {NotificationsTutanota} from "src/shared/model/account";
import {channel} from "./common";

// tslint:disable-next-line:no-unused-variable // TODO figure why tslint detects below import as unused
type Metadata = MemoryDbAccount<"tutanota">["metadata"];

export type TutanotaNotificationOutput = Partial<NotificationsTutanota> & Partial<{ batchEntityUpdatesCounter: number }>;

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, TutanotaNotificationOutput>;
    buildBatchEntityUpdatesDbPatch: ApiMethod<{ metadata: Metadata | null } & ZoneApiParameter,
        BatchEntityUpdatesDbPatch & { metadata: Required<Pick<Metadata, "groupEntityEventBatchIds">> }>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
