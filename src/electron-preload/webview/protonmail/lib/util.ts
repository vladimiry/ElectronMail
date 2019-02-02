import {pick} from "ramda";

import * as Rest from "./rest";
import {Arguments, Unpacked} from "src/shared/types";
import {buildDbPatchRetryPipeline} from "src/electron-preload/webview/util";

export const isUpsertOperationType = (<V = Unpacked<typeof Rest.Model.EVENT_ACTION._.values>>(
    types: Set<V>,
) => (type: V): boolean => {
    return types.has(type);
})(new Set([
    Rest.Model.EVENT_ACTION.CREATE,
    Rest.Model.EVENT_ACTION.UPDATE,
    Rest.Model.EVENT_ACTION.UPDATE_DRAFT,
    Rest.Model.EVENT_ACTION.UPDATE_FLAGS,
]));

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
    const appElement = window.angular.element(document);
    const $injector = appElement.data("$injector");
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
    const error = angularJsHttpResponseTypeGuard(rawError)
        ? { // TODO add tests to validate that "angularJsHttpResponseTypeGuard" call on this error still return "true"
            // whitelistening properties if error is "angular http response" object
            // so information like http headers and params is filtered out
            data: "<wiped out>",
            config: pick(["method", "url"], rawError.config),
            ...pick(["status", "statusText", "xhrStatus"], rawError),
            message: rawError.statusText || `HTTP request error`,
        }
        : rawError;
    const retriable = (
        !navigator.onLine
        ||
        (
            error !== rawError
            &&
            (
                // network connection error, connection abort, etc
                error.status === -1
                ||
                // requests to Protonmail's API end up with "503 service unavailable" error quite often during the day
                // so we retry/skip such errors in addition to the network errors with -1 status
                (error.status === 503 && error.statusText === "Service Unavailable")
                ||
                (error.status === 504 && error.statusText === "Gateway Time-out")
            )
        )
    );

    return {
        error,
        retriable,
        skippable: retriable,
    };
};
