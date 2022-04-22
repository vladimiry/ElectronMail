import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/const";

export const NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL = ONE_SECOND_MS * 1.5;

export const WEBVIEW_LOGGERS: Readonly<Record<"primary" | "calendar", Logger>> = {
    primary: buildLoggerBundle(`${__filename} [preload: webview/primary]`),
    calendar: buildLoggerBundle(`${__filename} [preload: webview/calendar]`),
};
