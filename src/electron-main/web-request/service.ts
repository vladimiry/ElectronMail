import {BeforeSendResponse, HeadersReceivedResponse, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails} from "electron";
import {URL} from "@cliqz/url-parser";

import {CorsProxy, GetHeaderCallResult} from "./model";
import {HEADERS} from "./const";
import {verifyUrlOriginValue} from "src/shared/util";

export const getHeader = (
    headers: Exclude<HeadersReceivedResponse["responseHeaders"] | BeforeSendResponse["requestHeaders"], undefined>,
    nameCriteria: string,
): GetHeaderCallResult => {
    const names = Object.keys(headers);
    const resolvedIndex = names.findIndex((name) => name.toLowerCase() === nameCriteria.toLowerCase());
    const resolvedName = resolvedIndex !== -1
        ? names[resolvedIndex]
        : null;

    if (!resolvedName) {
        return null;
    }

    const value = headers[resolvedName];

    if (typeof value === "undefined") {
        throw new Error("Invalid/undefined header value detected");
    }

    return {
        name: resolvedName,
        values: Array.isArray(value)
            ? value
            : [value],
    };
};

export function patchResponseHeader(
    headers: Exclude<HeadersReceivedResponse["responseHeaders"], undefined>,
    patch: DeepReadonly<ReturnType<typeof getHeader>>,
    {replace, extend = true, _default = true}: { replace?: boolean; extend?: boolean; _default?: boolean } = {},
): void {
    if (!patch) {
        return;
    }

    const header: Exclude<ReturnType<typeof getHeader>, null> =
        getHeader(headers, patch.name) || {name: patch.name, values: []};

    if (_default && !header.values.length) {
        headers[header.name] = [...patch.values];
        return;
    }

    headers[header.name] = replace
        ? [...patch.values]
        : extend
            ? [...header.values, ...patch.values]
            : header.values;
}

// TODO consider doing initial preflight/OPTIONS call to https://mail.protonmail.com
// and then pick all the "Access-Control-*" header names as a template instead of hardcoding the default headers
// since over time the server may start giving other headers
export const patchResponseHeaders: (
    arg: { corsProxy: CorsProxy; responseHeaders: OnHeadersReceivedListenerDetails["responseHeaders"] }
) => OnHeadersReceivedListenerDetails["responseHeaders"] = ({corsProxy, responseHeaders}) => {
    if (!responseHeaders) {
        return responseHeaders;
    }

    patchResponseHeader(
        responseHeaders,
        {
            name: HEADERS.response.accessControlAllowOrigin,
            values: corsProxy.headers.origin.values,
        },
        {replace: true},
    );

    patchResponseHeader(
        responseHeaders,
        {
            name: HEADERS.response.accessControlAllowMethods,
            values: [
                ...(corsProxy.headers.accessControlRequestMethod || {
                    values: [
                        "DELETE",
                        "GET",
                        "HEAD",
                        "OPTIONS",
                        "POST",
                        "PUT",
                    ],
                }).values,
            ],
        },
    );

    // this patching is needed for CORS request to work with Tor entry point via Tor proxy
    // TODO apply "access-control-allow-credentials" headers patch for Tor requests only
    //      see "details.url" value
    patchResponseHeader(
        responseHeaders,
        {
            name: HEADERS.response.accessControlAllowCredentials,
            values: ["true"],
        },
        {extend: false},
    );

    // this patching is needed for CORS request to work with Tor entry point via Tor proxy
    // TODO apply "access-control-allow-headers" headers patch for Tor requests only
    //      see "details.url" value
    patchResponseHeader(
        responseHeaders,
        {
            name: HEADERS.response.accessControlAllowHeaders,
            values: [
                ...(
                    corsProxy.headers.accessControlRequestHeaders
                    ||
                    // TODO consider dropping setting fallback "access-control-request-headers" values
                    {
                        values: [
                            "authorization",
                            "cache-control",
                            "content-type",
                            "Date",
                            "x-eo-uid",
                            "x-pm-apiversion",
                            "x-pm-appversion",
                            "x-pm-session",
                            "x-pm-uid",
                        ],
                    }
                ).values,
            ],
        },
    );

    patchResponseHeader(
        responseHeaders,
        {
            name: HEADERS.response.accessControlExposeHeaders,
            values: ["Date"],
        },
    );

    // starting from @electron v12 (more exactly from the respective @chromium version)
    // the "set-cookie" records with "samesite=strict" get blocked by @chromium, for example the "/api/auth/cookies" request case
    // so to workaround the issue we replace the "samesite=strict|lax"-like attribute with "samesite=none"
    for (const cookieName of Object.keys(responseHeaders)) {
        if (cookieName.toLowerCase() !== "set-cookie") {
            continue;
        }
        const cookies = responseHeaders[cookieName];
        if (cookies) {
            responseHeaders[cookieName] = cookies.map((cookieValue) => {
                // TODO consider patching the "samesite" cookie attribute only for "/api/auth/cookies" request
                return cookieValue.replace(/samesite[\s]*=[\s]*(strict|lax)/i, "samesite=none");
            });
        }
    }

    return responseHeaders;
};

// TODO consider resolving/returning the proxy only for URLs with `entryApiUrl`-like origin
export const resolveCorsProxy = (
    {requestHeaders, resourceType}: OnBeforeSendHeadersListenerDetails,
    allowedOrigins: readonly string[],
): CorsProxy | null => {
    const originHeader = (
        (
            String(resourceType).toLowerCase() === "xhr"
            ||
            String(getHeader(requestHeaders, HEADERS.request.contentType)).includes("application/json")
            ||
            Boolean(
                getHeader(requestHeaders, HEADERS.request.accessControlRequestHeaders),
            )
            ||
            Boolean(
                getHeader(requestHeaders, HEADERS.request.accessControlRequestMethod),
            )
        )
        &&
        getHeader(requestHeaders, HEADERS.request.origin)
    );
    const originValue = (
        originHeader
        &&
        originHeader.values.length
        &&
        verifyUrlOriginValue(
            new URL(originHeader.values[0] as string).origin,
        )
    );

    if (typeof originValue !== "string" || !originValue || !originHeader) {
        return null;
    }

    const originWhitelisted = allowedOrigins.some((allowedOrigin) => originValue === allowedOrigin);

    return originWhitelisted
        ? {
            headers: {
                origin: originHeader,
                accessControlRequestHeaders: getHeader(requestHeaders, HEADERS.request.accessControlRequestHeaders),
                accessControlRequestMethod: getHeader(requestHeaders, HEADERS.request.accessControlRequestMethod),
            },
        }
        : null;
};
