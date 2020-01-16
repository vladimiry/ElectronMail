import {
    BeforeSendResponse,
    HeadersReceivedResponse,
    OnBeforeSendHeadersListenerDetails,
    OnHeadersReceivedListenerDetails,
    Session,
} from "electron";
import {URL} from "url";

import {Context} from "./model";
import {ReadonlyDeep} from "type-fest";

// TODO drop these types when "requestHeaders / responseHeaders" get proper types
type RequestDetails = OnBeforeSendHeadersListenerDetails;
type ResponseDetails = OnHeadersReceivedListenerDetails;

type RequestProxy = ReadonlyDeep<{
    headers: {
        origin: Exclude<ReturnType<typeof getHeader>, null>,
        accessControlRequestHeaders: ReturnType<typeof getHeader>,
        accessControlRequestMethod: ReturnType<typeof getHeader>,
    };
}>;

const HEADERS = {
    request: {
        origin: "Origin",
        accessControlRequestHeaders: "Access-Control-Request-Headers",
        accessControlRequestMethod: "Access-Control-Request-Method",
        contentType: "Content-Type",
    },
    response: {
        accessControlAllowCredentials: "Access-Control-Allow-Credentials",
        accessControlAllowHeaders: "Access-Control-Allow-Headers",
        accessControlAllowMethods: "Access-Control-Allow-Methods",
        accessControlAllowOrigin: "Access-Control-Allow-Origin",
        accessControlExposeHeaders: "Access-Control-Expose-Headers",
    },
} as const;

const PROXIES = new Map<RequestDetails["id"] | ResponseDetails["id"], RequestProxy>();

// TODO pass additional "account type" argument and apply only respective listeners
export function initWebRequestListeners(ctx: Context, session: Session) {
    const webClientsOrigins = ctx.locations.webClients
        .map(({entryUrl}) => new URL(entryUrl).origin);

    session.webRequest.onBeforeSendHeaders(
        {urls: []},
        (
            details,
            callback,
        ) => {
            const {requestHeaders} = details;
            const requestProxy = resolveRequestProxy(details, webClientsOrigins);

            if (requestProxy) {
                const {name} = getHeader(requestHeaders, HEADERS.request.origin) || {name: HEADERS.request.origin};
                requestHeaders[name] = resolveFakeOrigin(details);
                PROXIES.set(details.id, requestProxy);
            }

            callback({requestHeaders});
        },
    );

    session.webRequest.onHeadersReceived(
        (
            details,
            callback,
        ) => {
            const requestProxy = PROXIES.get(details.id);

            if (requestProxy) {
                const responseHeaders = patchReponseHeaders({details, requestProxy});
                callback({responseHeaders});
                return;
            }

            callback({});
        },
    );
}

function resolveFakeOrigin(requestDetails: RequestDetails): string {
    // protonmail doesn't care much about "origin" value, so we generate the origin from request
    return new URL(requestDetails.url).origin;
}

function resolveRequestProxy(
    {requestHeaders, resourceType}: RequestDetails,
    origins: readonly string[],
): RequestProxy | null {
    const originHeader = (
        (
            String(resourceType).toUpperCase() === "XHR"
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
        new URL(originHeader.values[0]).origin
    );

    if (!originValue || !originHeader) {
        return null;
    }

    return origins.some((localOrigin) => originValue === localOrigin)
        ? {
            headers: {
                origin: originHeader,
                accessControlRequestHeaders: getHeader(requestHeaders, HEADERS.request.accessControlRequestHeaders),
                accessControlRequestMethod: getHeader(requestHeaders, HEADERS.request.accessControlRequestMethod),
            },
        }
        : null;
}

// TODO consider doing initial preflight/OPTIONS call to https://mail.protonmail.com
// and then pick all the "Access-Control-*" header names as a template instead of hardcoding the default headers
// since over time the server may start giving other headers
const patchReponseHeaders: (arg: { requestProxy: RequestProxy, details: ResponseDetails; }) => ResponseDetails["responseHeaders"]
    = ({requestProxy, details}) => {
    patchResponseHeader(
        details.responseHeaders,
        {
            name: HEADERS.response.accessControlAllowOrigin,
            values: requestProxy.headers.origin.values,
        },
        {replace: true},
    );

    patchResponseHeader(
        details.responseHeaders,
        {
            name: HEADERS.response.accessControlAllowMethods,
            values: [
                ...(requestProxy.headers.accessControlRequestMethod || {
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
                    requestProxy.headers.accessControlRequestHeaders
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

function patchResponseHeader(
    headers: HeadersReceivedResponse["responseHeaders"],
    patch: ReadonlyDeep<ReturnType<typeof getHeader>>,
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

function getHeader(
    headers: Exclude<HeadersReceivedResponse["responseHeaders"] | BeforeSendResponse["requestHeaders"], undefined>,
    nameCriteria: string,
): { name: string, values: string[]; } | null {
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
}
