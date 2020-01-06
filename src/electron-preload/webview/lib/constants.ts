import {AccountType} from "src/shared/model/account";
import {ONE_SECOND_MS} from "src/shared/constants";
import {ReadonlyDeep} from "type-fest";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

export const NOTIFICATION_LOGGED_IN_POLLING_INTERVAL = ONE_SECOND_MS;

export const NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL = ONE_SECOND_MS * 1.5;

export const WEBVIEW_LOGGERS: ReadonlyDeep<Record<AccountType, Record<"primary" | "calendar", ReturnType<typeof buildLoggerBundle>>>> = {
    protonmail: {
        primary: buildLoggerBundle("[WEBVIEW:protonmail-primary]"),
        calendar: buildLoggerBundle("[WEBVIEW:protonmail-calendar]"),
    },
};
