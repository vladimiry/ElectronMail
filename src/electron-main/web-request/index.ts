import _logger from "electron-log";
import {OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails} from "electron";

import {ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN} from "src/shared/constants";
import {AccountConfig} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {CorsProxy} from "./model";
import {HEADERS} from "./const";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {buildUrlOriginsFailedMsgTester, curryFunctionMembers, parseUrlOriginWithNullishCheck} from "src/shared/util";
import {getHeader, patchResponseHeaders, resolveCorsProxy} from "./service";
import {resolveInitializedSession} from "src/electron-main/session";

const logger = curryFunctionMembers(_logger, "[web-request]");

const requestProxyCache = (() => {
    type MapKeyArg = OnBeforeRequestListenerDetails | OnBeforeSendHeadersListenerDetails | OnHeadersReceivedListenerDetails;
    type MapValue = { imageUrlProxified?: boolean; corsProxy?: CorsProxy };

    const map = new Map<MapKeyArg["id"], MapValue>();

    return {
        patch({id}: DeepReadonly<MapKeyArg>, valuePatch: Partial<MapValue>): void {
            map.set(id, {...map.get(id), ...valuePatch});
        },
        get({id}: DeepReadonly<MapKeyArg>) {
            return map.get(id);
        },
        remove({id}: DeepReadonly<MapKeyArg>) {
            return map.delete(id);
        },
    } as const;
})();

const resolveFakeOrigin = (requestDetails: DeepReadonly<OnBeforeSendHeadersListenerDetails>): string => {
    // protonmail doesn't care much about "origin" value, so we resolve the value from a request
    return parseUrlOriginWithNullishCheck(requestDetails.url);
};

export function initWebRequestListenersByAccount(
    ctx: DeepReadonly<Context>,
    {
        login,
        entryUrl: accountEntryApiUrl,
        externalContentProxyUrlPattern,
        enableExternalContentProxy,
        blockNonEntryUrlBasedRequests,
    }: DeepReadonly<AccountConfig>,
): void {
    const session = resolveInitializedSession({login});
    const webClient = ctx.locations.webClients.find(({entryApiUrl}) => entryApiUrl === accountEntryApiUrl);

    if (!webClient) {
        throw new Error(`Failed to resolve the "web-client" bundle location by "${accountEntryApiUrl}" API entry point value`);
    }

    const externalContentProxyUrlPatternOrigin: string | false | undefined = (
        enableExternalContentProxy
        &&
        externalContentProxyUrlPattern
        &&
        parseUrlOriginWithNullishCheck(externalContentProxyUrlPattern)
    );
    const webClientEntryUrlOrigin = parseUrlOriginWithNullishCheck(webClient.entryUrl);
    const devToolsOrigin = parseUrlOriginWithNullishCheck("devtools://devtools");
    const allowedOrigins: readonly string[] = [
        accountEntryApiUrl,
        webClientEntryUrlOrigin,
        ...(
            BUILD_ENVIRONMENT === "development"
                ? [devToolsOrigin]
                : []
        ),
    ];

    // according to electron docs "only the last attached listener will be used", so no need to unsubscribe previously registered handlers
    session.webRequest.onBeforeRequest(
        {urls: []},
        (details, callback) => {
            const {url} = details;
            const urlOrigin = parseUrlOriginWithNullishCheck(url);

            if (
                enableExternalContentProxy
                &&
                !requestProxyCache.get(details)?.imageUrlProxified
                &&
                String(details.resourceType).toLowerCase() === "image"
                &&
                urlOrigin !== webClientEntryUrlOrigin // not proton's static image
                &&
                (
                    BUILD_ENVIRONMENT !== "development"
                    ||
                    urlOrigin !== devToolsOrigin // not devtools image
                )
            ) {
                if (!externalContentProxyUrlPattern) {
                    throw new Error(`Unexpected "external content proxy URL pattern" value.`);
                }
                const redirectURL = externalContentProxyUrlPattern.replace(ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN, details.url);
                requestProxyCache.patch(details, {imageUrlProxified: true});
                callback({redirectURL});
                return;
            }

            const bannedUrlAccessMessage: null | string = blockNonEntryUrlBasedRequests
                ? buildUrlOriginsFailedMsgTester([
                    ...allowedOrigins,
                    ...(
                        externalContentProxyUrlPatternOrigin && requestProxyCache.get(details)?.imageUrlProxified
                            ? [externalContentProxyUrlPatternOrigin]
                            : []
                    ),
                ])(url)
                : null;

            if (typeof bannedUrlAccessMessage === "string") {
                const message
                    = `Access to the "${details.resourceType}" resource with "${url}" URL has been forbidden. ${bannedUrlAccessMessage}`;

                setTimeout(() => { // can be asynchronous (speeds up callback resolving)
                    logger.error(message);
                    IPC_MAIN_API_NOTIFICATION$.next(
                        IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({message}),
                    );
                });

                return callback({cancel: true});
            }

            callback({});
        },
    );

    // according to electron docs "only the last attached listener will be used", so no need to unsubscribe previously registered handlers
    session.webRequest.onBeforeSendHeaders(
        {urls: []},
        (details, callback) => {
            const {requestHeaders} = details;
            const corsProxy = resolveCorsProxy(details, allowedOrigins);

            if (corsProxy) {
                const {name} = getHeader(requestHeaders, HEADERS.request.origin) || {name: HEADERS.request.origin};
                requestHeaders[name] = resolveFakeOrigin(details);
                requestProxyCache.patch(details, {corsProxy});
            }

            callback({requestHeaders});
        },
    );

    // according to electron docs "only the last attached listener will be used", so no need to unsubscribe previously registered handlers
    session.webRequest.onHeadersReceived(
        (details, callback) => {
            const requestProxy = requestProxyCache.get(details);

            if (!requestProxy) {
                callback({});
                return;
            }

            const {corsProxy} = requestProxy;

            if (corsProxy) {
                const responseHeaders = patchResponseHeaders({details, corsProxy});
                callback({responseHeaders});
            } else {
                callback({});
            }

            requestProxyCache.remove(details);
        },
    );
}
