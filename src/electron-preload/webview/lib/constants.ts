import {Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/constants";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

export const NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL = ONE_SECOND_MS * 1.5;

export const WEBVIEW_LOGGERS: DeepReadonly<Record<"primary" /* | "calendar" */, Logger>> = {
    primary: buildLoggerBundle("[preload: webview/primary]"),
};
