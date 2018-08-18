import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {BatchEntityUpdatesDatabasePatch, ZoneApiParameter} from "src/shared/api/common";
import {channel} from "./common";
import {CommonApi} from "src/shared/api/webview/common";
import {NotificationsTutanota} from "src/shared/model/account";
// tslint:disable-next-line:no-unused-variable // TODO figure why tslint detects below import as unused
import {DbContent, Folder, Mail} from "src/shared/model/database";

type Metadata = DbContent<"tutanota">["metadata"];

export interface TutanotaApi extends CommonApi {
    notification: ApiMethod<{ entryUrl: string } & ZoneApiParameter, Partial<NotificationsTutanota>>;
    bootstrapFetch: ApiMethod<Metadata & ZoneApiParameter,
        { mails: Mail[]; folders: Folder[] } & { metadata: Partial<Pick<Metadata, "groupEntityEventBatchIds">> }>;
    buildBatchEntityUpdatesDbPatch: ApiMethod<Metadata & ZoneApiParameter,
        BatchEntityUpdatesDatabasePatch & { metadata: Required<Pick<Metadata, "groupEntityEventBatchIds">> }>;
}

export const TUTANOTA_IPC_WEBVIEW_API = new WebViewApiService<TutanotaApi>({channel});
