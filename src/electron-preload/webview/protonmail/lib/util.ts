import {pick} from "ramda";

import * as Rest from "./rest";
import {UPSERT_EVENT_ACTIONS} from "src/electron-preload/webview/protonmail/lib/rest/model";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {buildDbPatchRetryPipeline} from "src/electron-preload/webview/util";

export const isUpsertOperationType: (v: Unpacked<typeof Rest.Model.EVENT_ACTION._.values>) => boolean = (() => {
    const types: ReadonlySet<Arguments<typeof isUpsertOperationType>[0]> = new Set(UPSERT_EVENT_ACTIONS);
    const result: typeof isUpsertOperationType = (type) => types.has(type);
    return result;
})();

export const angularJsHttpResponseTypeGuard: (data: ng.IHttpResponse<any> | any) => data is ng.IHttpResponse<any> = ((
    signatureKeys = Object.freeze<keyof ng.IHttpResponse<any>>(["data", "status", "config", "statusText", "xhrStatus"]),
) => {
    return ((data: ng.IHttpResponse<any> | any) => {
        if (typeof data !== "object") {
            return false;
        }
        return signatureKeys.reduce((count, prop) => count + Number(prop in data), 0) === signatureKeys.length;
    }) as typeof angularJsHttpResponseTypeGuard;
})();

export function isLoggedIn(): boolean {
    const appElement = window.angular && window.angular.element(document);
    const $injector = appElement && appElement.data("$injector");
    const authentication: undefined | { user?: object; isLoggedIn: () => boolean; } = $injector && $injector.get("authentication");

    return Boolean(
        authentication
        &&
        authentication.isLoggedIn()
        &&
        authentication.user
        &&
        Object.keys(authentication.user).length,
    );
}

export const preprocessError: Arguments<typeof buildDbPatchRetryPipeline>[0] = (rawError: any) => {
    const sanitizedNgHttpResponse: (Omit<ng.IHttpResponse<"<wiped out>">, "headers"> & { message: string; headers: "<wiped out>" }) | false
        = angularJsHttpResponseTypeGuard(rawError)
        ? (() => {
            const result = {
                // TODO add tests to validate that "angularJsHttpResponseTypeGuard" call on this error still return "true"
                // whitelistening properties if error is "angular http response" object
                // so information like http headers and params is filtered out
                message: rawError.statusText || "HTTP request error",
                ...pick(["status", "statusText", "xhrStatus"], rawError),
                config: pick(["method", "url"], rawError.config),
                data: "<wiped out>",
                headers: "<wiped out>",
            } as const;
            WEBVIEW_LOGGERS.protonmail.error("preprocessError()", JSON.stringify(result));
            return result;
        })()
        : false;
    const retriable: boolean = (
        !navigator.onLine
        ||
        (
            sanitizedNgHttpResponse
            &&
            (
                // network connection error, connection abort, etc
                sanitizedNgHttpResponse.status === -1
                ||
                // requests to Protonmail's API end up with "503 service unavailable" error quite often during the day
                // so we retry/skip such errors in addition to the network errors with -1 status
                (sanitizedNgHttpResponse.status === 503 && sanitizedNgHttpResponse.statusText === "Service Unavailable")
                ||
                (sanitizedNgHttpResponse.status === 504 && sanitizedNgHttpResponse.statusText === "Gateway Time-out")
            )
        )
    );

    return {
        error: sanitizedNgHttpResponse
            ? new Error(sanitizedNgHttpResponse.message)
            : rawError,
        retriable,
        skippable: retriable,
    };
};
