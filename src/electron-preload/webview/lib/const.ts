import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {Logger} from "src/shared/model/common";
import {PACKAGE_NAME} from "src/shared/const";

export const WEBVIEW_LOGGERS: Readonly<Record<"primary" | "calendar", Logger>> = {
    primary: buildLoggerBundle(`${__filename} [preload: webview/primary]`),
    calendar: buildLoggerBundle(`${__filename} [preload: webview/calendar]`),
};

export const RATE_LIMITED_METHOD_CALL_MESSAGE = `${PACKAGE_NAME}_RATE_LIMITED_METHOD_CALL_MESSAGE`;

export const PROTON_MAX_CONCURRENT_FETCH = 10;

// https://github.com/ProtonMail/WebClients/blob/0bbd15b60334ee3322f9a71789f0773e33ede80b/packages/encrypted-search/lib/constants.ts#L14
export const PROTON_MAX_QUERY_PORTION_LIMIT = 150;
