import _logger from "electron-log";
import {
    OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnCompletedListenerDetails, OnErrorOccurredListenerDetails,
    OnHeadersReceivedListenerDetails,
} from "electron";
import {pick} from "remeda";
import {URL} from "@cliqz/url-parser";

import {ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN} from "src/shared/const";
import {AccountConfig} from "src/shared/model/account";
import {buildUrlOriginsFailedMsgTester, parseUrlOriginWithNullishCheck, resolvePrimaryDomainNameFromUrlHostname} from "src/shared/util/url";
import {CorsProxy} from "./model";
import {curryFunctionMembers, reduceDuplicateItemsFromArray} from "src/shared/util";
import {depersonalizeProtonApiUrl, resolveProtonApiOrigin} from "src/shared/util/proton-url";
import {getHeader, patchCorsResponseHeaders, patchResponseSetCookieHeaderRecords, resolveCorsProxy} from "./service";
import {getUserAgentByAccount} from "src/electron-main/util";
import {HEADERS, STATIC_ALLOWED_ORIGINS} from "./const";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/const";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {PROTON_API_SUBDOMAINS} from "src/shared/const/proton-url";
import {protonApiUrlsUtil} from "src/electron-main/util/proton-url";
import {resolveInitializedAccountSession} from "src/electron-main/session";

const logger = curryFunctionMembers(_logger, __filename);

const requestProxyCache = (() => {
    type MapKeyArg =
        | OnBeforeRequestListenerDetails
        | OnBeforeSendHeadersListenerDetails
        | OnHeadersReceivedListenerDetails
        | OnErrorOccurredListenerDetails
        | OnCompletedListenerDetails;
    type MapValue = { redirectAllowedOrigin?: string; corsProxy?: CorsProxy };
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

const resolveWebRequestUrl = (
    url: string,
): (Readonly<Pick<URL, "href" | "scheme" | "hostname" | "origin" | "pathname"> & { primaryDomainName: string }>) | null => {
    const {scheme, hostname, origin: rawOrigin, pathname} = new URL(url);
    try {
        const origin = parseUrlOriginWithNullishCheck(rawOrigin);
        return {
            href: url,
            scheme,
            hostname,
            origin,
            pathname,
            primaryDomainName: resolvePrimaryDomainNameFromUrlHostname(hostname),
        } as const;
    } catch (error) { // https://github.com/vladimiry/ElectronMail/issues/525
        logger.error(JSON.stringify({rawOrigin: String(rawOrigin)}), error);
    }
    return null;
};

// according to electron docs "only the last attached listener will be used" so no need to unsubscribe previously registered handlers
export function initWebRequestListenersByAccount(
    {
        login,
        entryUrl: accountEntryUrl,
        externalContentProxyUrlPattern,
        enableExternalContentProxy,
        blockNonEntryUrlBasedRequests,
        customUserAgent,
    }: DeepReadonly<AccountConfig>,
): void {
    const session = resolveInitializedAccountSession({login, entryUrl: accountEntryUrl});
    const resolveAllowedOrigins = (url: Exclude<ReturnType<typeof resolveWebRequestUrl>, null>): readonly string [] => {
        return reduceDuplicateItemsFromArray([
            ...[
                ...[
                    ...STATIC_ALLOWED_ORIGINS,
                    ...PROTON_API_SUBDOMAINS.map((subdomain) => resolveProtonApiOrigin({accountEntryUrl, subdomain})),
                ],
                ...(() => {
                    // - it has been noticed the at least "fra-storage/zrh-storage/storage" subdomains used by Proton for Drive service
                    // - interesting thing is that those subdomains are not hardcoded in the https://github.com/ProtonMail/WebClients code
                    //     but likely dynamically received form the request to the server
                    // - so whitelisting all the subdomains of such kind
                    // https://github.com/vladimiry/ElectronMail/issues/508
                    const firstUrlSubdomain = String(url.href.split(".").shift()?.split("://").pop());
                    const isStorageSubdomain = (
                        (firstUrlSubdomain === "storage" || firstUrlSubdomain.endsWith("-storage"))
                        &&
                        url.primaryDomainName === resolvePrimaryDomainNameFromUrlHostname(
                            new URL(accountEntryUrl).hostname,
                        )
                    );
                    return isStorageSubdomain ? [url.origin] : [];
                })(),
                ...(() => {
                    // the iframe page generated by /core/v4/captcha?Token=... request at least loads the following stuff:
                    //   - script: https://hcaptcha.com/1/api.js?onload=loadCaptcha&render=explicit
                    //   - subFrame: https://newassets.hcaptcha.com/captcha/v1/335f764/static/hcaptcha.html
                    //   - possibly https://accounts.hcaptcha.com
                    // so whitelisting it with subdomains
                    return url.origin === "https://hcaptcha.com" || url.origin.endsWith(".hcaptcha.com") ? [url.origin]: [];
                })(),
            ].map(parseUrlOriginWithNullishCheck),
        ]);
    };

    session.webRequest.onBeforeRequest(
        {urls: []},
        (details, callback) => {
            const allowRequest = (): void => callback({});
            const banRequest = (): void => callback({cancel: true});
            const url = resolveWebRequestUrl(details.url);

            if (!url) {
                banRequest();
                return;
            }

            const allowedOrigins = resolveAllowedOrigins(url);

            if (
                // feature enabled
                enableExternalContentProxy
                &&
                // has not yet been proxified (preventing infinity redirect loop)
                !requestProxyCache.get(details)?.redirectAllowedOrigin
                &&
                // only image resources
                String(details.resourceType).toLowerCase() === "image"
                &&
                // TODO consider proxyfying only images with http/https schemes
                // WARN: should be called before consequent "parseUrlOriginWithNullishCheck" call
                // embedded/"cid:"-prefixed urls should not be processed/proxyfied (origin resolving for such urls returns "null")
                !isProtonEmbeddedUrl(url.href)
                &&
                // resources served from "allowed origins" should not be proxified as those
                // are local resources (proton's static resource & API, devtools, etc)
                !allowedOrigins.includes(url.origin)
                &&
                // TODO consider proxyfying only images with http/https schemes
                // local resource
                url.scheme !== "chrome-extension"
            ) {
                if (!externalContentProxyUrlPattern) {
                    throw new Error(`Invalid "external content proxy URL pattern" value.`);
                }

                const redirectURL = externalContentProxyUrlPattern.replace(ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN, url.href);

                if (
                    redirectURL === externalContentProxyUrlPattern
                    ||
                    !redirectURL.includes(url.href)
                ) {
                    throw new Error(`Failed to substitute "${url.href}" in "${externalContentProxyUrlPattern}" pattern.`);
                }

                requestProxyCache.patch(
                    details,
                    {redirectAllowedOrigin: parseUrlOriginWithNullishCheck(redirectURL)},
                );

                callback({redirectURL});
                return;
            }

            if (!blockNonEntryUrlBasedRequests) {
                allowRequest();
                return;
            }

            if (isProtonEmbeddedUrl(url.href)) {
                // embedded/"cid:"-prefixed urls get silently blocked (origin resolving for such urls returns "null")
                banRequest();
                return;
            }

            const redirectAllowedOrigin = requestProxyCache.get(details)?.redirectAllowedOrigin;
            const bannedUrlAccessMsg: null | string = buildUrlOriginsFailedMsgTester([
                ...allowedOrigins,
                ...(
                    redirectAllowedOrigin
                        ? [redirectAllowedOrigin]
                        : []
                ),
            ])(url.href);

            if (typeof bannedUrlAccessMsg !== "string") {
                allowRequest();
                return;
            }

            setTimeout(() => { // can be asynchronous (speeds up callback resolving)
                const message = [
                    `Access to the "${details.resourceType}" resource with "${url.href}" URL has been forbidden. \n\n${bannedUrlAccessMsg}`,
                    ` \n\nThis error message is related to the disabled by default "Block non 'API entry point'-based network requests" `,
                    `feature, see https://github.com/vladimiry/ElectronMail/issues/312#issuecomment-709650619 for details.`,
                ].join("");
                logger.error(message);
                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({message}),
                );
            });

            requestProxyCache.remove(details);

            banRequest();
        },
    );

    session.webRequest.onBeforeSendHeaders(
        {urls: []},
        (details, callback) => {
            const {requestHeaders} = details;
            const url = resolveWebRequestUrl(details.url);
            const corsProxy = url && resolveCorsProxy(
                details,
                resolveAllowedOrigins(url),
            );

            if (corsProxy) {
                {
                    const {name: headerName} = getHeader(requestHeaders, HEADERS.request.origin) ?? {name: HEADERS.request.origin};
                    requestHeaders[headerName] = resolveFakeOrigin(details);
                    requestProxyCache.patch(details, {corsProxy});
                }
            }

            {
                if (customUserAgent) {
                    for (const headerName of Object.keys(requestHeaders)) {
                        if (headerName.toLowerCase().startsWith("sec-ch-ua")) {
                            delete requestHeaders[headerName];
                        }
                    }
                }
                // the "session.setUserAgent()" makes an effect only once (first call, see the docs)
                // so we resolve and set the header explicitly for each request
                const {name: headerName} = getHeader(requestHeaders, HEADERS.request.userAgent) ?? {name: HEADERS.request.userAgent};
                requestHeaders[headerName] = getUserAgentByAccount({customUserAgent});
            }

            protonApiUrlsUtil.patchAuthHeaders(String(url?.pathname), requestHeaders);

            callback({requestHeaders});
        },
    );

    session.webRequest.onHeadersReceived(
        (details, callback) => {
            const {responseHeaders} = details;
            const corsProxy = requestProxyCache.get(details)?.corsProxy;

            requestProxyCache.remove(details);

            if (!responseHeaders) {
                callback({});
                return;
            }

            if (corsProxy) {
                patchCorsResponseHeaders(responseHeaders, corsProxy);
            }

            protonApiUrlsUtil.patchCaptchaResponseHeaders(new URL(details.url).pathname, responseHeaders);
            patchResponseSetCookieHeaderRecords({url: details.url, responseHeaders});

            callback({responseHeaders});
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
