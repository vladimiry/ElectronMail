import {URL} from "url";

import {BuildEnvironment} from "src/shared/model/common";
import {Context} from "./model";
import {getDefaultSession} from "./session";

const headerNames = {
    origin: "origin",
    accessControlAllowOrigin: "access-control-allow-origin",
};
const originsToRestoreMap = new Map<number, string>();

export function initWebRequestListeners(ctx: Context) {
    if ((process.env.NODE_ENV as BuildEnvironment) !== "development") {
        return;
    }

    const isLocalWebClientOrigin: (origin: string) => boolean = (() => {
        const localOrigins = Object
            .values(ctx.locations.webClients.protonmail)
            .map(({entryUrl}) => buildOrigin(new URL(entryUrl)));
        return (origin: string) => localOrigins.some((localOrigin) => origin === localOrigin);
    })();

    // TODO (TS / electron.d.ts) "webRequest.onBeforeSendHeaders" signature is not properly declared
    getDefaultSession().webRequest.onBeforeSendHeaders(
        {urls: []},
        (
            details: Details & { requestHeaders: HeadersMap; },
            callback: (arg: { cancel: boolean; requestHeaders: typeof details.requestHeaders; }) => void,
        ) => {
            const headers = details.requestHeaders;
            const originHeader = getHeader(headers, headerNames.origin);
            const origin = originHeader && buildOrigin(new URL(originHeader.value[0]));

            if (
                String(details.resourceType).toLowerCase() === "xhr" &&
                origin &&
                isLocalWebClientOrigin(origin)
            ) {
                const {name} = getHeader(headers, headerNames.origin) || {name: headerNames.origin};
                headers[name] = buildOrigin(new URL(details.url));
                originsToRestoreMap.set(details.id, origin);
            }

            callback({cancel: false, requestHeaders: details.requestHeaders});
        },
    );

    // TODO (TS / electron.d.ts) "webRequest.onHeadersReceived" signature is not properly declared
    getDefaultSession().webRequest.onHeadersReceived(
        (
            details: Details & { responseHeaders: HeadersMap; },
            callback: (arg: { responseHeaders: typeof details.responseHeaders }) => void,
        ) => {
            const headers = details.responseHeaders;
            const originToRestore = originsToRestoreMap.get(details.id);

            if (originToRestore) {
                const {name} = getHeader(headers, headerNames.accessControlAllowOrigin) || {name: headerNames.accessControlAllowOrigin};
                headers[name] = [originToRestore];
                originsToRestoreMap.delete(details.id);
            }

            callback({responseHeaders: headers});
        },
    );
}

function getHeader(headers: HeadersMap, headerName: string): { name: string, value: string[]; } | null {
    const names = Object.keys(headers);
    const resolvedIndex = names.findIndex((name) => name.toLowerCase() === headerName);
    const resolvedName = resolvedIndex !== -1
        ? names[resolvedIndex]
        : null;

    if (!resolvedName) {
        return null;
    }

    const value = headers[resolvedName];

    return {
        name: resolvedName,
        value: Array.isArray(value)
            ? value
            : [value],
    };
}

function buildOrigin(url: URL): string {
    return `${url.protocol}//${url.host}${url.port ? ":" + url.port : ""}`;
}

interface Details {
    id: number;
    url: string;
    method: string;
    resourceType?: string;
}

interface HeadersMap {
    [k: string]: string | string[];
}
