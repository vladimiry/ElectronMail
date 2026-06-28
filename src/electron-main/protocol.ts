import _logger from "electron-log";
import {app, net, protocol, Session} from "electron";
import {first} from "rxjs/operators";
import fs from "fs";
import {lastValueFrom, Observable} from "rxjs";
import {lookup as lookupMimeType} from "mrmime";
import path from "path";
import pathIsInside from "path-is-inside";
import {pathToFileURL} from "url";
import {promisify} from "util";
import {URL} from "@ghostery/url-parser";

import type {AccountConfig} from "src/shared/model/account";
import {AccountSessionAppData, Context} from "src/electron-main/model";
import {assertEntryUrl} from "src/electron-main/util";
import {Config} from "src/shared/model/options";
import {curryFunctionMembers} from "src/shared/util";
import {
    LOCAL_WEBCLIENT_DIR_NAME, LOCAL_WEBCLIENT_SCHEME_NAME, WEB_DATAURL_PROTOCOL_SCHEME, WEB_PROTOCOL_DIR, WEB_PROTOCOL_SCHEME,
} from "src/shared/const";
import {
    PROTON_API_URL_PLACEHOLDER, PROTON_APP_MAIL_LOGIN_PATHNAME, PROTON_SUPPRESS_UPSELL_ADS_PLACEHOLDER,
} from "src/shared/const/proton-url";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolveProtonApiOrigin, resolveProtonAppTypeFromUrlHref} from "src/shared/util/proton-url";

const logger = curryFunctionMembers(_logger, __filename);

const fsAsync = {stat: promisify(fs.stat), readFile: promisify(fs.readFile)} as const;

export const registerStandardSchemes: () => void = (
    () => {
        let called = false;
        return (): void => {
            if (called) {
                // WARN: "protocol.registerStandardSchemes" needs to be called once, see https://github.com/electron/electron/issues/15943
                throw new Error(`The "protocol.registerSchemesAsPrivileged" call can't happen more than one time`);
            }
            protocol.registerSchemesAsPrivileged([
                {
                    scheme: LOCAL_WEBCLIENT_SCHEME_NAME,
                    privileges: {corsEnabled: true, secure: true, standard: true, supportFetchAPI: true, allowServiceWorkers: true},
                },
                {
                    scheme: WEB_DATAURL_PROTOCOL_SCHEME,
                    privileges: {standard: true},
                },
            ]);
            called = true;
        };
    }
)();

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export function registerWebFolderFileProtocols(ctx: Context, session: Session): void {
    const directory = path.join(ctx.locations.appDir, WEB_PROTOCOL_DIR);

    for (const scheme of [WEB_PROTOCOL_SCHEME, WEB_DATAURL_PROTOCOL_SCHEME] as const) {
        session.protocol.handle(scheme, async (request) => {
            const url = new URL(request.url);
            const resource = path.normalize(path.join(directory, url.host, url.pathname));
            if (!pathIsInside(resource, directory)) {
                throw new Error(`Forbidden file system resource "${resource}"`);
            }
            const resourceUrl = pathToFileURL(resource).toString();
            return net.fetch(resourceUrl, {bypassCustomProtocolHandlers: true});
        });
    }
}

const resolveResourcePathname: (requestPathname: string) => string | undefined = (() => {
    const nonEmptyBasePathsSortedByLengthDesc: readonly string[] = Object
        .values(PROVIDER_REPO_MAP)
        .filter(Boolean /* keeping non-empty values */)
        .map(({basePath}) => basePath).sort((a, b) => b.length - a.length);
    return (template: string): string | undefined => {
        return nonEmptyBasePathsSortedByLengthDesc.find((item) => `${template}/`.startsWith(`/${item}/`));
    };
})();

async function resolveFileSystemResourceLocation(directory: string, requestUrl: URL): Promise<string | null> {
    const requestPathname = requestUrl.pathname === PROTON_APP_MAIL_LOGIN_PATHNAME
        ? "login.html"
        : requestUrl.pathname === "/inbox"
        ? "/"
        : requestUrl.pathname;
    const resourcePathname = requestPathname !== "/" && !path.extname(requestPathname)
        ? resolveResourcePathname(requestPathname)
        : requestPathname;
    if (typeof resourcePathname !== "string") {
        throw new Error(`Failed to resolve file system resource directory from the "${requestUrl.href}" request`);
    }
    const resource = path.join(directory, resourcePathname);

    logger.verbose(nameof(resolveFileSystemResourceLocation), {directory, resource});

    if (!pathIsInside(resource, directory)) {
        throw new Error(`Forbidden file system resource "${resource}"`);
    }

    try {
        const stat = await fsAsync.stat(resource);

        if (stat.isFile()) {
            return resource;
        }
        if (stat.isDirectory()) {
            return path.join(resource, "index.html");
        }
    } catch (error) {
        logger.error(nameof(resolveFileSystemResourceLocation), error);
        if ((Object(error) as {code?: unknown}).code === "ENOENT") {
            return null;
        }
        throw error;
    }

    return null;
}

const getProtonApiOrigin = ({entryUrl, requestUrl}: Readonly<Pick<AccountConfig, "entryUrl">> & {requestUrl: URL}): string => {
    return resolveProtonApiOrigin({
        accountEntryUrl: entryUrl,
        subdomain: PROVIDER_REPO_MAP[resolveProtonAppTypeFromUrlHref(requestUrl.href).type].apiSubdomain,
    });
};

const readFileAndInjectApiUrl = async (
    fileLocation: string,
    {entryUrl, requestUrl, config$}: Readonly<Pick<AccountConfig, "entryUrl">> & {requestUrl: URL; config$: Observable<Config>},
): Promise<string> => {
    assertEntryUrl(entryUrl);

    const config = await lastValueFrom(config$.pipe(first()));

    return (await fsAsync.readFile(fileLocation)).toString()
        .replaceAll(PROTON_API_URL_PLACEHOLDER, getProtonApiOrigin({entryUrl, requestUrl}))
        .replaceAll(PROTON_SUPPRESS_UPSELL_ADS_PLACEHOLDER, String(config.suppressUpsellMessages));
};

export async function registerAccountSessionProtocols(
    ctx: DeepReadonly<Context>,
    session: Session & DeepReadonly<AccountSessionAppData>,
): Promise<void> {
    await app.whenReady(); // TODO setup timeout on "ready" even firing

    const directory = path.join(ctx.locations.appDir, LOCAL_WEBCLIENT_DIR_NAME);

    session.protocol.handle(LOCAL_WEBCLIENT_SCHEME_NAME, async (request) => {
        const requestUrl = new URL(request.url);
        const resourceLocation = await resolveFileSystemResourceLocation(directory, requestUrl);

        if (!resourceLocation) {
            const message = `Failed to resolve "${request.url}" resource`;
            logger.error(message);
            return new Response(message, {
                status: 400,
                headers: {"content-type": "text/html"},
            });
        }

        const resourceExtension = (path.parse(resourceLocation).ext ?? "").toLowerCase();
        const response = new Response(
            [".js", ".cjs", ".mjs", ".html"].includes(resourceExtension)
                ? await readFileAndInjectApiUrl(resourceLocation, {
                    entryUrl: session._electron_mail_data_.entryUrl,
                    requestUrl,
                    config$: ctx.config$,
                })
                : await fsAsync.readFile(resourceLocation),
            {
                headers: {
                    "content-type": (() => {
                        const mimeType = lookupMimeType(resourceExtension);
                        if (!mimeType) {
                            throw new Error(
                                `Failed to resolve "${nameof(mimeType)}" by the ${JSON.stringify({resourceExt: resourceExtension})} value`,
                            );
                        }
                        return mimeType;
                    })(),
                },
            },
        );

        // TODO tweak e2e test: navigate to "/drive" (requires to be signed-in into the mail account)
        //      so the scope misconfiguration-related error get printed to "log.log" file and the test gets failed then
        if (resourceLocation.startsWith(path.join(directory, PROVIDER_REPO_MAP["proton-drive"].basePath, "downloadSW."))) {
            response.headers.append("Service-Worker-Allowed", "/");
            response.headers.append("Service-Worker", "script");
        }

        return response;
    });
}
