import {ActionType, ScanApiDefinition, createWebViewApiService} from "electron-rpc-api";

import {MailPasswordFieldContainer} from "src/shared/model/container";
import {NotificationsProtonmail} from "src/shared/model/account";
import {ZoneApiParameter} from "src/shared/api/common";
import {buildWebViewApiDefinition, channel} from "./common";

const {Promise} = ActionType;

export type ProtonmailApiScan = ScanApiDefinition<typeof PROTONMAIL_IPC_WEBVIEW_API_DEFINITION>;

export type ProtonmailApi = ProtonmailApiScan["Api"];

export type ProtonmailNotificationOutput = Partial<NotificationsProtonmail> & Partial<{ batchEntityUpdatesCounter: number }>;

export const PROTONMAIL_IPC_WEBVIEW_API_DEFINITION = {
    ...buildWebViewApiDefinition<"protonmail", ProtonmailNotificationOutput>(),
    unlock: Promise<[MailPasswordFieldContainer & ZoneApiParameter]>(),
} as const;

export const PROTONMAIL_IPC_WEBVIEW_API = createWebViewApiService({
    channel,
    apiDefinition: PROTONMAIL_IPC_WEBVIEW_API_DEFINITION,
});
