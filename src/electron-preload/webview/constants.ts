import {AccountType} from "src/shared/model/account";
import {buildLoggerBundle} from "src/electron-preload/util";
import {ONE_SECOND_MS} from "src/shared/constants";

export const NOTIFICATION_LOGGED_IN_POLLING_INTERVAL = ONE_SECOND_MS;

export const NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL = ONE_SECOND_MS * 1.5;

export const WEBVIEW_LOGGERS: Record<AccountType, ReturnType<typeof buildLoggerBundle>> = {
    tutanota: buildLoggerBundle("[WEBVIEW:tutanota]"),
    protonmail: buildLoggerBundle("[WEBVIEW:protonmail]"),
};
