import _logger from "electron-log";
import {app, protocol, ProtocolResponse, Session} from "electron";
import {first} from "rxjs/operators";
import fs from "fs";
import {lastValueFrom, Observable} from "rxjs";
import {lookup as lookupMimeType} from "mrmime";
import path from "path";
import pathIsInside from "path-is-inside";
import {promisify} from "util";
import {Readable} from "stream";
import {URL} from "@cliqz/url-parser";

import type {AccountConfig} from "src/shared/model/account";
import {AccountSessionAppData, Context} from "src/electron-main/model";
import {assertEntryUrl} from "src/electron-main/util";
import {Config} from "src/shared/model/options";
import {curryFunctionMembers} from "src/shared/util";
import {LOCAL_WEBCLIENT_DIR_NAME, LOCAL_WEBCLIENT_SCHEME_NAME, WEB_PROTOCOL_DIR, WEB_PROTOCOL_SCHEME} from "src/shared/const";
import {PROTON_API_URL_PLACEHOLDER, PROTON_SUPPRESS_UPSELL_ADS_PLACEHOLDER} from "src/shared/const/proton-url";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolveProtonApiOrigin, resolveProtonAppTypeFromUrlHref} from "src/shared/util/proton-url";

const logger = curryFunctionMembers(_logger, __filename);

const fsAsync = {
    stat: promisify(fs.stat),
    readFile: promisify(fs.readFile),
} as const;

const basePaths: readonly string[] = Object
    .values(PROVIDER_REPO_MAP)
    .map(({basePath}) => basePath);

export const registerStandardSchemes = (): void => {
    // WARN: "protocol.registerStandardSchemes" needs to be called once, see https://github.com/electron/electron/issues/15943
    protocol.registerSchemesAsPrivileged([
        {
            scheme: LOCAL_WEBCLIENT_SCHEME_NAME,
            privileges: {
                corsEnabled: true,
                secure: true,
                standard: true,
                supportFetchAPI: true,
                allowServiceWorkers: true,
            },
        },
    ]);
};

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export function registerWebFolderFileProtocol(ctx: Context, session: Session): void {
    const webPath = path.join(ctx.locations.appDir, WEB_PROTOCOL_DIR);
    const scheme = WEB_PROTOCOL_SCHEME;
    const registered = session.protocol.registerFileProtocol(
        scheme,
        (request, callback) => {
            const url = new URL(request.url);
            const resource = path.normalize(
                path.join(webPath, url.host, url.pathname),
            );
            if (!pathIsInside(resource, webPath)) {
                throw new Error(`Forbidden file system resource "${resource}"`);
            }
            callback({path: resource});
        },
    );
    if (!registered) {
        throw new Error(`Failed to register "${scheme}" protocol mapped to "${webPath}" directory`);
    }
}

async function resolveFileSystemResourceLocation(directory: string, requestUrl: URL): Promise<string | null> {
    const resource = (() => {
        const urlBasedResource = path.normalize(
            path.join(directory, requestUrl.pathname),
        );
        return path.extname(urlBasedResource)
            ? urlBasedResource
            : (() => {
                const leadingFolder = path
                    .relative(directory, urlBasedResource)
                    .split(path.sep)
                    .shift();
                return leadingFolder && basePaths.includes(leadingFolder)
                    ? path.join(directory, leadingFolder)
                    : directory;
            })();
    })();

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
        if ((Object(error) as { code?: unknown }).code === "ENOENT") {
            return null;
        }
        throw error;
    }

    return null;
}

const readFileAndInjectApiUrl = async (
    fileLocation: string,
    {
        entryUrl: accountEntryUrl,
        requestUrl,
        config$,
    }: Readonly<Pick<AccountConfig, "entryUrl">> & { requestUrl: URL, config$: Observable<Config> },
): Promise<Readable> => {
    assertEntryUrl(accountEntryUrl);

    const config = await lastValueFrom(config$.pipe(first()));
    const {suppressUpsellMessages} = config;

    return Readable.from(
        Buffer.from(
            (await fsAsync.readFile(fileLocation)).toString()
                .replaceAll(
                    PROTON_API_URL_PLACEHOLDER,
                    resolveProtonApiOrigin({
                        accountEntryUrl,
                        subdomain: PROVIDER_REPO_MAP[resolveProtonAppTypeFromUrlHref(requestUrl.href).type].apiSubdomain,
                    }),
                )
                .replaceAll(PROTON_SUPPRESS_UPSELL_ADS_PLACEHOLDER, String(suppressUpsellMessages)),
        ),
    );
};

export async function registerAccountSessionProtocols(
    ctx: DeepReadonly<Context>,
    session: Session & DeepReadonly<AccountSessionAppData>,
): Promise<void> {
    await app.whenReady(); // TODO setup timeout on "ready" even firing

    const scheme = LOCAL_WEBCLIENT_SCHEME_NAME;
    const directory = path.join(ctx.locations.appDir, LOCAL_WEBCLIENT_DIR_NAME);
    const registered = session.protocol.registerStreamProtocol(
        scheme,
        async (request, callback) => {
            const requestUrl = new URL(request.url);
            const resourceLocation = await resolveFileSystemResourceLocation(directory, requestUrl);

            if (!resourceLocation) {
                const message = `Failed to resolve "${request.url}" resource`;
                logger.error(message);
                callback({statusCode: 404});
                return;
            }

            const resourceExt = (path.parse(resourceLocation).ext ?? "").toLowerCase();
            const mimeType = lookupMimeType(resourceExt);
            if (!mimeType) {
                throw new Error(`Failed to resolve "${nameof(mimeType)}" by the ${JSON.stringify({resourceExt})} value`);
            }
            const data: Readable = [".js", ".cjs", ".mjs", ".html"].includes(resourceExt)
                ? await readFileAndInjectApiUrl(
                    resourceLocation,
                    {
                        entryUrl: session._electron_mail_data_.entryUrl,
                        requestUrl,
                        config$: ctx.config$,
                    },
                )
                : fs.createReadStream(resourceLocation);
            const callbackResponse: ProtocolResponse = {mimeType, data};

            // TODO tweak e2e test: navigate to "/drive" (requires to be signed-in into the mail account)
            //      so the scope misconfiguration-related error get printed to "log.log" file and the test gets failed then
            if (resourceLocation.startsWith(
                path.join(directory, PROVIDER_REPO_MAP["proton-drive"].basePath, "assets", "downloadSW."),
            )) {
                /* eslint-disable max-len */
                // https://github.com/ProtonMail/proton-drive/blob/04d30ae6c9fbfbc33cfc91499831e2e6458a99b1/src/.htaccess#L42-L45
                // https://github.com/ProtonMail/WebClients/blob/38397839bdf9c14f7c0c8af5cef46122ec399cb2/applications/drive/src/.htaccess#L36
                /* eslint-enable max-len */
                Object.assign(
                    callbackResponse.headers ??= {},
                    {
                        "Service-Worker-Allowed": "/",
                        "Service-Worker": "script",
                    },
                );
            }

            callback(callbackResponse);
        },
    );

    if (!registered) {
        throw new Error(`Failed to register "${scheme}" protocol mapped to "${directory}" directory`);
    }
}
