import {ActionType, ScanService, createWebViewApiService} from "electron-rpc-api";

import {MailPasswordFieldContainer} from "src/shared/model/container";
import {NotificationsProtonmail} from "src/shared/model/account";
import {ZoneApiParameter} from "src/shared/api/common";
import {buildLoggerBundle} from "src/electron-preload/util";
import {buildWebViewApiDefinition, channel} from "./common";

export type ProtonmailApiScan = ScanService<typeof PROTONMAIL_IPC_WEBVIEW_API>;

export type ProtonmailApi = ProtonmailApiScan["ApiClient"];

export type ProtonmailNotificationOutput = Partial<NotificationsProtonmail> & Partial<{ batchEntityUpdatesCounter: number }>;

export const PROTONMAIL_IPC_WEBVIEW_API_DEFINITION = {
    ...buildWebViewApiDefinition<"protonmail", ProtonmailNotificationOutput>(),
    unlock: ActionType.Promise<MailPasswordFieldContainer & ZoneApiParameter>(),
} as const;

export const PROTONMAIL_IPC_WEBVIEW_API = createWebViewApiService({
    channel,
    apiDefinition: PROTONMAIL_IPC_WEBVIEW_API_DEFINITION,
    logger: buildLoggerBundle("[IPC_WEBVIEW_API:protonmail]"),
});
