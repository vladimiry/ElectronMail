import fs from "fs";
import stream from "stream";
import request, {CookieJar, Response} from "request";
import {InterceptStreamProtocolRequest, StreamProtocolResponse, protocol} from "electron";
import {URL} from "url";

import {BuildEnvironment} from "src/shared/model/common";
import {LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN} from "src/shared/constants";
import {getDefaultSession} from "./session";

interface HeadersMap {
    [k: string]: string;
}

const fakeOrigin = "https://localhost:2015";
const localWebClientLocationProtocolRe = new RegExp(`^${LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN}`);
const headerNames = {
    origin: "origin",
    accessControlAllowOriginHeader: "access-control-allow-origin",
    contentType: "content-Type",
};
const resolveCookieJar: (req: InterceptStreamProtocolRequest) => CookieJar = (() => {
    const cookieJarMap = new Map<string, CookieJar>();
    return (req: InterceptStreamProtocolRequest) => {
        const mapKey = new URL(req.url).protocol;
        let cookieJar: CookieJar | undefined = cookieJarMap.get(mapKey);
        if (!cookieJar) {
            cookieJar = request.jar();
            cookieJarMap.set(mapKey, cookieJar);
        }
        return cookieJar;
    };
})();

export function initProtocolInterceptor(): Promise<void> {
    if ((process.env.NODE_ENV as BuildEnvironment) !== "development") {
        return Promise.resolve();
    }

    return new Promise((resolveInterception, rejectInterception) => {
        protocol.interceptStreamProtocol(
            "https",
            async (req, callback) => {
                const requestHeaders = req.headers as HeadersMap;
                const requestOriginHeader = getHeader(requestHeaders, headerNames.origin);
                const requestOrigin = requestOriginHeader
                    ? buildOrigin(new URL(requestOriginHeader.value))
                    : null;
                const needToTrickOrigin = requestOrigin && localWebClientLocationProtocolRe.exec(requestOrigin);
                const {response} = await new Promise<{ response: Response }>(async (resolveRequest, rejectRequest) => request(
                    {
                        url: req.url,
                        method: req.method,
                        headers: {
                            ...requestHeaders,
                            ...(needToTrickOrigin && {[requestOriginHeader && requestOriginHeader.name || headerNames.origin]: fakeOrigin}),
                        },
                        jar: resolveCookieJar(req),
                        ...(detectBinaryResponse(req) && {encoding: null}),
                        body: await (async () => {
                            if (!req.uploadData) {
                                return;
                            }
                            const bodyStream = new stream.PassThrough();
                            for (const {blobUUID, bytes, file} of req.uploadData) {
                                if (blobUUID) {
                                    const blobUUIDBuffer = await new Promise((resolveBlob, rejectBlob) => {
                                        try {
                                            getDefaultSession().getBlobData(blobUUID, resolveBlob);
                                        } catch (e) {
                                            rejectBlob(e);
                                        }
                                    });
                                    bodyStream.write(blobUUIDBuffer);
                                }
                                if (bytes) {
                                    bodyStream.write(bytes);
                                }
                                if (file) {
                                    fs.createReadStream(file).pipe(bodyStream);
                                }
                            }
                            bodyStream.end();
                            return bodyStream;
                        })(),
                    },
                    (error, res) => {
                        if (error) {
                            return rejectRequest(error);
                        }
                        resolveRequest({response: res});
                    },
                ));
                const responseHeaders: HeadersMap = Object
                    .entries(response.headers)
                    .reduce(
                        (map: HeadersMap, [key, value]) => {
                            if (typeof value === "undefined") {
                                return map;
                            }
                            if (Array.isArray(value)) {
                                const [firstValue] = value;
                                map[key] = firstValue;
                            } else {
                                map[key] = value;
                            }
                            return map;
                        },
                        {},
                    );
                const protocolResponse: StreamProtocolResponse = {
                    data: (() => {
                        const bodyStream = new stream.PassThrough();
                        bodyStream.end(response.body);
                        // TODO (TS / d.ts) ReadableStream / NodeJS.ReadableStream collusion
                        // track https://github.com/electron/electron/pull/11008#issuecomment-389955692
                        return bodyStream as any;
                    })(),
                    headers: {
                        ...responseHeaders,
                        ...(
                            needToTrickOrigin && requestOrigin && {
                                [(getHeader(responseHeaders, headerNames.accessControlAllowOriginHeader)
                                    || {name: headerNames.accessControlAllowOriginHeader}).name]: requestOrigin,
                            }
                        ),
                    },
                    statusCode: response.statusCode,
                };
                callback(protocolResponse);
            },
            (error) => {
                if (error) {
                    rejectInterception(error);
                    return;
                }
                resolveInterception();
            },
        );
    });
}

function detectBinaryResponse(req: InterceptStreamProtocolRequest) {
    return req.method.toUpperCase() === "GET" && req.url.includes("/api/attachments/");
}

function getHeader(headers: HeadersMap, headerName: string): { name: string, value: string } | null {
    const keys = Object.keys(headers);
    const resolvedHeaderIndex = keys.findIndex((name) => name.toLowerCase() === headerName);
    const resolvedHeaderName = resolvedHeaderIndex !== -1
        ? keys[resolvedHeaderIndex]
        : null;

    return resolvedHeaderName
        ? {name: resolvedHeaderName, value: headers[resolvedHeaderName]}
        : null;
}

function buildOrigin(url: URL): string {
    return `${url.protocol}//${url.host}${url.port ? ":" + url.port : ""}`;
}
