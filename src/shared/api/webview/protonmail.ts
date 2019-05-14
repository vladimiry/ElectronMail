import {ActionType, ScanService, createWebViewApiService} from "electron-rpc-api";

import {MailPasswordFieldContainer} from "src/shared/model/container";
import {NotificationsProtonmail} from "src/shared/model/account";
import {ZoneApiParameter} from "src/shared/api/common";
import {buildWebViewApiDefinition, channel} from "./common";

const {Promise} = ActionType;

export type ProtonmailApiScan = ScanService<typeof PROTONMAIL_IPC_WEBVIEW_API>;

export type ProtonmailApi = ProtonmailApiScan["ApiClient"];

export type ProtonmailNotificationOutput = Partial<NotificationsProtonmail> & Partial<{ batchEntityUpdatesCounter: number }>;

export const PROTONMAIL_IPC_WEBVIEW_API_DEFINITION = {
    ...buildWebViewApiDefinition<"protonmail", ProtonmailNotificationOutput>(),
    unlock: Promise<MailPasswordFieldContainer & ZoneApiParameter>(),
} as const;

export const PROTONMAIL_IPC_WEBVIEW_API = createWebViewApiService({
    channel,
    apiDefinition: PROTONMAIL_IPC_WEBVIEW_API_DEFINITION,
});
