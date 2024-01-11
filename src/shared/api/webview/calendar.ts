import {ActionType, createWebViewApiService, ScanService} from "electron-rpc-api";

import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "./const";
import {Notifications} from "src/shared/model/account";

const channel = IPC_WEBVIEW_API_CHANNELS_MAP.calendar.communication;

export const PROTON_CALENDAR_IPC_WEBVIEW_API = createWebViewApiService({
    // TODO drop "{ accountIndex: number}" use
    apiDefinition: {
        ping: ActionType.Promise<DeepReadonly<{ accountIndex: number }>, { value: string }>(),
        notification: ActionType.Observable<{ accountIndex: number }, ProtonCalendarNotificationOutput>(),
    } as const,
    channel,
    logger: buildLoggerBundle(`${__filename} [${channel}]`),
});

export type ProtonCalendarApiScan = ScanService<typeof PROTON_CALENDAR_IPC_WEBVIEW_API>;

export type ProtonCalendarApi = ProtonCalendarApiScan["ApiClient"];

export type ProtonCalendarNotificationOutput = Partial<Pick<Notifications, "loggedInCalendar">>
    & { calendarNotification?: ConstructorParameters<typeof window.Notification> };
