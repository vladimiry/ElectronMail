import {URL} from "url";

import {AccountType} from "src/shared/model/account";
import {Context} from "./model";
import {ElectronContextLocations} from "src/shared/model/electron";
import {getDefaultSession} from "./session";

interface Details {
    id: number;
    url: string;
    method: string;
    resourceType?: string;
}

type RequestDetails = Details & { requestHeaders: HeadersMap };

type ResponseDetails = Details & { responseHeaders: HeadersMap<string[]> };

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

export function initWebRequestListeners({locations}: Context) {
    const resolveProxy: (details: RequestDetails) => RequestProxy | null = (() => {
        const origins: { [k in AccountType]: string[] } = {
            ...resolveLocalWebClientOrigins("protonmail", locations),
            ...resolveLocalWebClientOrigins("tutanota", locations),
        };

        return (details: RequestDetails) => {
            const proxies: { [k in AccountType]: ReturnType<typeof resolveRequestProxy> } = {
                protonmail: resolveRequestProxy("protonmail", details, origins),
                tutanota: resolveRequestProxy("tutanota", details, origins),
            };
            const [accountType]: Array<AccountType | undefined> = Object.keys(proxies) as any;

            return accountType
                ? proxies[accountType]
                : null;
        };
    })();

    getDefaultSession().webRequest.onBeforeSendHeaders(
        {urls: []},
        // TODO TS/electron.d.ts: "webRequest.onBeforeSendHeaders" listener signature is not declared properly
        (
            requestDetails: RequestDetails,
            callback: (arg: { cancel: boolean; requestHeaders: typeof requestDetails.requestHeaders; }) => void,
        ) => {
            const {requestHeaders} = requestDetails;
            const requestProxy = resolveProxy(requestDetails);

            if (requestProxy) {
                const {name} = getHeader(requestHeaders, HEADERS.request.origin) || {name: HEADERS.request.origin};
                requestHeaders[name] = buildOrigin(new URL(requestDetails.url));
                PROXIES.set(requestDetails.id, requestProxy);
            }

            callback({cancel: false, requestHeaders});
        },
    );

    getDefaultSession().webRequest.onHeadersReceived(
        // TODO TS/electron.d.ts: "webRequest.onHeadersReceived" listener signature is not declared properly
        (
            responseDetails: ResponseDetails,
            callback: (arg: { responseHeaders: typeof responseDetails.responseHeaders }) => void,
        ) => {
            const requestProxy = PROXIES.get(responseDetails.id);
            const responseHeaders = requestProxy
                ? responseHeadersPatchHandlers[requestProxy.accountType]({responseDetails, requestProxy})
                : responseDetails.responseHeaders;

            callback({responseHeaders});
        },
    );
}

function resolveLocalWebClientOrigins<T extends AccountType>(
    accountType: T,
    {webClients}: ElectronContextLocations,
): { [k in T]: string[]; } {
    return {
        [accountType]: Object
            .values(webClients[accountType])
            .map(({entryUrl}) => buildOrigin(new URL(entryUrl))),
    };
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

    if (!originValue) {
        return null;
    }

    return origins[accountType].some((localOrigin) => originValue === localOrigin)
        ? {
            accountType,
            headers: {
                origin: (() => {
                    const result = getHeader(requestHeaders, HEADERS.request.origin);
                    if (!result) {
                        throw new Error(``);
                    }
                    return result;
                })(),
                accessControlRequestHeaders: getHeader(requestHeaders, HEADERS.request.accessControlRequestHeaders),
                accessControlRequestMethod: getHeader(requestHeaders, HEADERS.request.accessControlRequestMethod),
            },
        }
        : null;
}

// TODO consider doing initial preflight/OPTIONS call to https://mail.protonmail.com
// and then pick all the "Access-Control-*" header names as a template instead of hardcoding the default headers
// since over time the server may start giving other headers
const responseHeadersPatchHandlers: {
    [k in AccountType]: (
        arg: { requestProxy: RequestProxy, responseDetails: ResponseDetails; },
    ) => ResponseDetails["responseHeaders"];
} = {
    protonmail: ({requestProxy, responseDetails}) => {
        const {responseHeaders} = responseDetails;

        patchResponseHeader(
            responseHeaders,
            {
                name: HEADERS.response.accessControlAllowCredentials,
                values: ["true"],
            },
            {extend: false},
        );
        patchResponseHeader(
            responseHeaders,
            {
                name: HEADERS.response.accessControlAllowHeaders,
                values: [
                    ...(requestProxy.headers.accessControlRequestHeaders || {values: []}).values,
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
            },
        );
        patchResponseHeader(
            responseHeaders,
            {
                name: HEADERS.response.accessControlAllowMethods,
                values: [
                    ...(requestProxy.headers.accessControlRequestMethod || {
                        values: [
                            "HEAD",
                            "OPTIONS",
                            "POST",
                            "PUT",
                            "DELETE",
                            "GET",
                        ],
                    }).values,
                ],
            },
        );
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
                name: HEADERS.response.accessControlExposeHeaders,
                values: ["Date"],
            },
        );

        return responseHeaders;
    },
    tutanota: ({responseDetails}) => {
        return responseDetails.responseHeaders;
    },
};

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
