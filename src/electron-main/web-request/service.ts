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

    return {
        name: resolvedName,
        values: Array.isArray(value)
            ? value
            : [value],
    };
};

export function patchResponseHeader(
    headers: HeadersReceivedResponse["responseHeaders"],
    patch: DeepReadonly<ReturnType<typeof getHeader>>,
    {replace, extend = true, _default = true}: { replace?: boolean; extend?: boolean; _default?: boolean } = {},
): void {
    if (!patch || !headers) {
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
    arg: { corsProxy: CorsProxy; details: OnHeadersReceivedListenerDetails }
) => OnHeadersReceivedListenerDetails["responseHeaders"]
    = ({corsProxy, details}) => {
    patchResponseHeader(
        details.responseHeaders,
        {
            name: HEADERS.response.accessControlAllowOrigin,
            values: corsProxy.headers.origin.values,
        },
        {replace: true},
    );

    patchResponseHeader(
        details.responseHeaders,
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

    // this patching is needed for CORS request to work with https://protonirockerxow.onion/ entry point via Tor proxy
    // TODO apply "access-control-allow-credentials" headers patch for "https://protonirockerxow.onion/*" requests only
    //      see "details.url" value
    patchResponseHeader(
        details.responseHeaders,
        {
            name: HEADERS.response.accessControlAllowCredentials,
            values: ["true"],
        },
        {extend: false},
    );

    // this patching is needed for CORS request to work with https://protonirockerxow.onion/ entry point via Tor proxy
    // TODO apply "access-control-allow-headers" headers patch for "https://protonirockerxow.onion/*" requests only
    //      see "details.url" value
    patchResponseHeader(
        details.responseHeaders,
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
        details.responseHeaders,
        {
            name: HEADERS.response.accessControlExposeHeaders,
            values: ["Date"],
        },
    );

    return details.responseHeaders;
};

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
            new URL(originHeader.values[0]).origin,
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
