import {ActionType, createWebViewApiService, ScanService} from "electron-rpc-api";

import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {Notifications} from "src/shared/model/account";
import {PACKAGE_NAME} from "src/shared/const";

// TODO drop "ZoneApiParameter" use
export const PROTON_CALENDAR_IPC_WEBVIEW_API_DEFINITION = {
    ping: ActionType.Promise<DeepReadonly<{ accountIndex: number} >>(),
    notification: ActionType.Observable<{ accountIndex: number} , ProtonCalendarNotificationOutput>(),
} as const;

export const PROTON_CALENDAR_IPC_WEBVIEW_API = createWebViewApiService({
    apiDefinition: PROTON_CALENDAR_IPC_WEBVIEW_API_DEFINITION,
    channel: `${PACKAGE_NAME}:webview-api:calendar`,
    logger: buildLoggerBundle(`${__filename} [webview-api:calendar]`),
});

export type ProtonCalendarApiScan = ScanService<typeof PROTON_CALENDAR_IPC_WEBVIEW_API>;

export type ProtonCalendarApi = ProtonCalendarApiScan["ApiClient"];

export type ProtonCalendarNotificationOutput = Partial<Pick<Notifications, "loggedInCalendar">>
    & { calendarNotification?: ConstructorParameters<typeof window.Notification> };
