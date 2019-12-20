import {OnBeforeSendHeadersDetails, OnHeadersReceivedDetails, Session} from "electron";
import {URL} from "url";

import {AccountType} from "src/shared/model/account";
import {Context} from "./model";
import {ElectronContextLocations} from "src/shared/model/electron";

// TODO drop these types when "requestHeaders / responseHeaders" get proper types
type RequestDetails = OnBeforeSendHeadersDetails & { requestHeaders: HeadersMap };
type ResponseDetails = OnHeadersReceivedDetails & { responseHeaders: HeadersMap<string[]> };

interface HeadersMap<V extends string | string[] = string | string[]> {
    [k: string]: V;
}

interface RequestProxy {
    accountType: AccountType;
    headers: {
        origin: Exclude<ReturnType<typeof getHeader>, null>,
        accessControlRequestHeaders: ReturnType<typeof getHeader>,
        accessControlRequestMethod: ReturnType<typeof getHeader>,
    };
}

const HEADERS = {
    request: {
        origin: "Origin",
        accessControlRequestHeaders: "Access-Control-Request-Headers",
        accessControlRequestMethod: "Access-Control-Request-Method",
    },
    response: {
        accessControlAllowCredentials: "Access-Control-Allow-Credentials",
        accessControlAllowHeaders: "Access-Control-Allow-Headers",
        accessControlAllowMethods: "Access-Control-Allow-Methods",
        accessControlAllowOrigin: "Access-Control-Allow-Origin",
        accessControlExposeHeaders: "Access-Control-Expose-Headers",
    },
};
const PROXIES = new Map<number, RequestProxy>();

// TODO pass additional "account type" argument and apply only respective listeners
export function initWebRequestListeners(ctx: Context, session: Session) {
    const resolveProxy: (details: RequestDetails) => RequestProxy | null = (() => {
        const origins: { [k in AccountType]: string[] } = {
            ...resolveLocalWebClientOrigins("tutanota", ctx.locations),
        };

        return (details: RequestDetails) => {
            const proxies: { [k in AccountType]: ReturnType<typeof resolveRequestProxy> } = {
                tutanota: resolveRequestProxy("tutanota", details, origins),
            };
            const [accountType] = Object.entries(proxies)
                .filter((([, value]) => Boolean(value)))
                .map((([key]) => key as AccountType | undefined));

            return accountType
                ? proxies[accountType]
                : null;
        };
    })();

    session.webRequest.onBeforeSendHeaders(
        {urls: []},
        (
            requestDetailsArg,
            callback,
        ) => {
            const requestDetails = requestDetailsArg as RequestDetails;
            const {requestHeaders} = requestDetails;
            const requestProxy = resolveProxy(requestDetails);

            if (requestProxy) {
                const {name} = getHeader(requestHeaders, HEADERS.request.origin) || {name: HEADERS.request.origin};
                requestHeaders[name] = resolveFakeOrigin();
                PROXIES.set(requestDetails.id, requestProxy);
            }

            callback({cancel: false, requestHeaders});
        },
    );

    session.webRequest.onHeadersReceived(
        (
            responseDetailsArg,
            callback,
        ) => {
            const responseDetails = responseDetailsArg as ResponseDetails;
            const requestProxy = PROXIES.get(responseDetails.id);
            const responseHeaders = requestProxy
                ? responseHeadersPatchHandlers[requestProxy.accountType]({responseDetails, requestProxy})
                : responseDetails.responseHeaders;

            callback({responseHeaders, cancel: false});
        },
    );
}

function resolveFakeOrigin(): string {
    // WARN: tutanota responds to the specific origins only
    // it will not work for example with http://localhost:2015 origin, so they go with a whitelisting
    return "http://localhost:9000";
}

function resolveLocalWebClientOrigins<T extends AccountType>(
    accountType: T,
    {webClients}: ElectronContextLocations,
): Record<T, string[]> {
    const result: ReturnType<typeof resolveLocalWebClientOrigins> = Object.create(null);

    result[accountType] = Object
        .values(webClients[accountType])
        .map(({entryUrl}) => buildOrigin(new URL(entryUrl)));

    return result;
}

function resolveRequestProxy<T extends AccountType>(
    accountType: T,
    {requestHeaders, resourceType}: RequestDetails,
    origins: Record<AccountType, string[]>,
): RequestProxy | null {
    const originHeader = (
        String(resourceType).toUpperCase() === "XHR" &&
        getHeader(requestHeaders, HEADERS.request.origin)
    );
    const originValue = (
        originHeader &&
        buildOrigin(new URL(originHeader.values[0]))
    );

    if (!originValue || !originHeader) {
        return null;
    }

    return origins[accountType].some((localOrigin) => originValue === localOrigin)
        ? {
            accountType,
            headers: {
                origin: originHeader,
                accessControlRequestHeaders: getHeader(requestHeaders, HEADERS.request.accessControlRequestHeaders),
                accessControlRequestMethod: getHeader(requestHeaders, HEADERS.request.accessControlRequestMethod),
            },
        }
        : null;
}

// TODO consider doing initial preflight/OPTIONS call to https://mail.protonmail.com / https://mail.tutanota.com
// and then pick all the "Access-Control-*" header names as a template instead of hardcoding the default headers
// since over time the server may start giving other headers
const responseHeadersPatchHandlers: {
    [k in AccountType]: (
        arg: { requestProxy: RequestProxy, responseDetails: ResponseDetails; },
    ) => ResponseDetails["responseHeaders"];
} = (() => {
    const commonPatch: typeof responseHeadersPatchHandlers[AccountType] = ({requestProxy, responseDetails: {responseHeaders}}) => {
        patchResponseHeader(
            responseHeaders,
            {
                name: HEADERS.response.accessControlAllowOrigin,
                values: requestProxy.headers.origin.values,
            },
            {replace: true},
        );
        patchResponseHeader(
            responseHeaders,
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
        return responseHeaders;
    };

    const result: typeof responseHeadersPatchHandlers = {
        tutanota: ({requestProxy, responseDetails}) => {
            const {responseHeaders} = responseDetails;

            commonPatch({requestProxy, responseDetails});

            patchResponseHeader(
                responseHeaders,
                {
                    name: HEADERS.response.accessControlAllowHeaders,
                    values: [
                        ...(requestProxy.headers.accessControlRequestHeaders || {
                            values: [
                                "content-type",
                                "v",
                            ],
                        }).values,
                    ],
                },
            );

            return responseHeaders;
        },
    };

    return result;
})();

function patchResponseHeader(
    headers: ResponseDetails["responseHeaders"],
    patch: ReturnType<typeof getHeader>,
    {replace, extend = true, _default = true}: { replace?: boolean; extend?: boolean; _default?: boolean } = {},
): void {
    if (!patch) {
        return;
    }

    const header: Exclude<ReturnType<typeof getHeader>, null> =
        getHeader(headers, patch.name) || {name: patch.name, values: []};

    if (_default && !header.values.length) {
        headers[header.name] = patch.values;
        return;
    }

    headers[header.name] = replace
        ? patch.values
        : extend
            ? [...header.values, ...patch.values]
            : header.values;
}

function getHeader(headers: HeadersMap, nameCriteria: string): { name: string, values: string[]; } | null {
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

function buildOrigin(url: URL): string {
    return `${url.protocol}//${url.host}${url.port ? ":" + url.port : ""}`;
}
