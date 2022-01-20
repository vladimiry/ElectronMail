import _logger from "electron-log";
import {
    OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnCompletedListenerDetails, OnErrorOccurredListenerDetails,
    OnHeadersReceivedListenerDetails,
} from "electron";
import {pick} from "remeda";
import {URL} from "@cliqz/url-parser";

import {ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN} from "src/shared/constants";
import {AccountConfig} from "src/shared/model/account";
import {
    buildUrlOriginsFailedMsgTester, curryFunctionMembers, depersonalizeProtonApiUrl, parseUrlOriginWithNullishCheck,
} from "src/shared/util";
import {Context} from "src/electron-main/model";
import {CorsProxy} from "./model";
import {getHeader, patchResponseHeaders, resolveCorsProxy} from "./service";
import {HEADERS} from "./const";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {resolveInitializedAccountSession} from "src/electron-main/session";

const logger = curryFunctionMembers(_logger, __filename);

const requestProxyCache = (() => {
    type MapKeyArg =
        | OnBeforeRequestListenerDetails
        | OnBeforeSendHeadersListenerDetails
        | OnHeadersReceivedListenerDetails
        | OnErrorOccurredListenerDetails
        | OnCompletedListenerDetails;
    type MapValue = { additionAllowedOrigin?: string; corsProxy?: CorsProxy };

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

const isProtonEmbeddedUrl = (() => {
    // https://github.com/ProtonMail/proton-shared/blob/84c149ebd0419e13e9a1504404a1d1803c53500c/lib/helpers/image.ts#L171
    const nonSchemaLikePrefix = "cid:";

    return (url: string): boolean => {
        return (
            url.startsWith(nonSchemaLikePrefix)
            &&
            url.substr(nonSchemaLikePrefix.length, 2) !== "//" // preventing "cid://"-like url schema use
        );
    };
})();

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
    const session = resolveInitializedAccountSession({login});
    const webClient = ctx.locations.webClients.find(({entryApiUrl}) => entryApiUrl === accountEntryApiUrl);

    if (!webClient) {
        throw new Error(`Failed to resolve the "web-client" bundle location by "${accountEntryApiUrl}" API entry point value`);
    }

    const allowedOrigins: readonly string[] = [
        webClient.entryApiUrl,
        webClient.entryUrl,
        "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai",
        ...(
            BUILD_ENVIRONMENT === "development"
                ? ["devtools://devtools"]
                : []
        ),
    ].map(parseUrlOriginWithNullishCheck);

    // according to electron docs "only the last attached listener will be used" so no need to unsubscribe previously registered handlers
    session.webRequest.onBeforeRequest(
        {urls: []},
        (details, callback) => {
            const {url} = details;
            const allowRequest = (): void => callback({});
            const banRequest = (): void => callback({cancel: true});

            if (
                // feature enabled
                enableExternalContentProxy
                &&
                // has not yet been proxified (preventing infinity redirect loop)
                !requestProxyCache.get(details)?.additionAllowedOrigin
                &&
                // only image resources
                String(details.resourceType).toLowerCase() === "image"
                &&
                // TODO consider proxyfying only images with http/https schemes
                // WARN: should be called before consequent "parseUrlOriginWithNullishCheck" call
                // embedded/"cid:"-prefixed urls should not be processed/proxyfied (origin resolving for such urls returns "null")
                !isProtonEmbeddedUrl(url)
                &&
                // resources served from "allowed origins" should not be proxified as those
                // are local resources (proton's static resource & API, devtools, etc)
                !allowedOrigins.includes(
                    parseUrlOriginWithNullishCheck(url),
                )
                &&
                // TODO consider proxyfying only images with http/https schemes
                // local resource
                new URL(url).scheme !== "chrome-extension"
            ) {
                if (!externalContentProxyUrlPattern) {
                    throw new Error(`Invalid "external content proxy URL pattern" value.`);
                }

                const redirectURL = externalContentProxyUrlPattern.replace(ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN, url);

                if (
                    redirectURL === externalContentProxyUrlPattern
                    ||
                    !redirectURL.includes(url)
                ) {
                    throw new Error(`Failed to substitute "${url}" in "${externalContentProxyUrlPattern}" pattern.`);
                }

                requestProxyCache.patch(
                    details,
                    {additionAllowedOrigin: parseUrlOriginWithNullishCheck(redirectURL)},
                );

                callback({redirectURL});
                return;
            }

            if (!blockNonEntryUrlBasedRequests) {
                allowRequest();
                return;
            }

            if (isProtonEmbeddedUrl(url)) {
                // embedded/"cid:"-prefixed urls get silently blocked (origin resolving for such urls returns "null")
                banRequest();
                return;
            }

            const additionAllowedOrigin = requestProxyCache.get(details)?.additionAllowedOrigin;
            const bannedUrlAccessMsg: null | string = buildUrlOriginsFailedMsgTester([
                ...allowedOrigins,
                ...(
                    additionAllowedOrigin
                        ? [additionAllowedOrigin]
                        : []
                ),
            ])(url);

            if (typeof bannedUrlAccessMsg !== "string") {
                allowRequest();
                return;
            }

            setTimeout(() => { // can be asynchronous (speeds up callback resolving)
                const message
                    = `Access to the "${details.resourceType}" resource with "${url}" URL has been forbidden. ${bannedUrlAccessMsg}`;
                logger.error(message);
                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({message}),
                );
            });

            requestProxyCache.remove(details);

            banRequest();
        },
    );

    // according to electron docs "only the last attached listener will be used", so no need to unsubscribe previously registered handlers
    session.webRequest.onBeforeSendHeaders(
        {urls: []},
        (details, callback) => {
            const {requestHeaders} = details;
            const corsProxy = resolveCorsProxy(details, allowedOrigins);

            if (corsProxy) {
                {
                    const {name} = getHeader(requestHeaders, HEADERS.request.origin) || {name: HEADERS.request.origin};
                    requestHeaders[name] = resolveFakeOrigin(details);
                    requestProxyCache.patch(details, {corsProxy});
                }
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
                callback({responseHeaders: patchResponseHeaders({responseHeaders: details.responseHeaders, corsProxy})});
            } else {
                callback({});
            }

            requestProxyCache.remove(details);
        },
    );

    session.webRequest.onErrorOccurred((details) => {
        requestProxyCache.remove(details);
        logger.warn({
            ...pick(details, ["resourceType", "error"]),
            url: depersonalizeProtonApiUrl(details.url),
        });
    });

    session.webRequest.onCompleted((details) => {
        requestProxyCache.remove(details);
    });
}
