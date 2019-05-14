import {ScanService, createWebViewApiService} from "electron-rpc-api";

import {NotificationsTutanota} from "src/shared/model/account";
import {buildWebViewApiDefinition, channel} from "./common";

export type TutanotaNotificationOutput = Partial<NotificationsTutanota> & Partial<{ batchEntityUpdatesCounter: number }>;

export type TutanotaScanApi = ScanService<typeof TUTANOTA_IPC_WEBVIEW_API>;

export type TutanotaApi = TutanotaScanApi["Api"];

export const TUTANOTA_IPC_WEBVIEW_API_DEFINITION = {
    ...buildWebViewApiDefinition<"tutanota", TutanotaNotificationOutput>(),
} as const;

export const TUTANOTA_IPC_WEBVIEW_API = createWebViewApiService({
    channel,
    apiDefinition: TUTANOTA_IPC_WEBVIEW_API_DEFINITION,
});
