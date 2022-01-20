import _logger from "electron-log";
import {app, protocol, ProtocolResponse, Session} from "electron";
import fs from "fs";
import path from "path";
import pathIsInside from "path-is-inside";
import {promisify} from "util";
import {URL} from "@cliqz/url-parser";

import {Context} from "src/electron-main/model";
import {curryFunctionMembers} from "src/shared/util";
import {PROVIDER_REPO_MAP} from "src/shared/proton-apps-constants";
import {WEB_PROTOCOL_SCHEME} from "src/shared/constants";

const logger = curryFunctionMembers(_logger, __filename);

const fsAsync = {
    stat: promisify(fs.stat),
    readFile: promisify(fs.readFile),
} as const;

const basePaths: readonly string[] = Object
    .values(PROVIDER_REPO_MAP)
    .map(({basePath}) => basePath);

export function registerStandardSchemes(ctx: Context): void {
    // WARN: "protocol.registerStandardSchemes" needs to be called once, see https://github.com/electron/electron/issues/15943
    protocol.registerSchemesAsPrivileged(
        ctx.locations.protocolBundles.map(({scheme}) => ({
            scheme,
            privileges: {
                corsEnabled: true,
                secure: true,
                standard: true,
                supportFetchAPI: true,
                allowServiceWorkers: true,
            },
        })),
    );
}

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export function registerWebFolderFileProtocol(ctx: Context, session: Session): void {
    const webPath = path.join(ctx.locations.appDir, "./web");
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

async function resolveFileSystemResourceLocation(
    directory: string,
    request: Parameters<Parameters<(typeof protocol)["registerBufferProtocol"]>[1]>[0],
): Promise<string | null> {
    const resource = (() => {
        const urlBasedResource = path.normalize(
            path.join(directory, new URL(request.url).pathname),
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

export async function registerSessionProtocols(ctx: DeepReadonly<Context>, session: Session): Promise<void> {
    // TODO setup timeout on "ready" even firing
    await app.whenReady();

    for (const {scheme, directory} of ctx.locations.protocolBundles) {
        const registered = session.protocol.registerFileProtocol(
            scheme,
            async (request, callback) => {
                const resourceLocation = await resolveFileSystemResourceLocation(directory, request);

                if (!resourceLocation) {
                    const message = `Failed to resolve "${request.url}" resource`;
                    logger.error(message);
                    callback({statusCode: 404});
                    return;
                }

                const callbackResponse: Pick<ProtocolResponse, "path" | "headers"> = {path: resourceLocation};

                // TODO tweak e2e test: navigate to "/drive" (requires to be signed-in into the mail account)
                //      so the scope misconfiguration-related error get printed to "log.log" file and the test gets failed then
                if (resourceLocation.startsWith(
                    path.join(directory, PROVIDER_REPO_MAP["proton-drive"].basePath, "downloadSW."),
                )) {
                    /* eslint-disable max-len */
                    // https://github.com/ProtonMail/proton-drive/blob/04d30ae6c9fbfbc33cfc91499831e2e6458a99b1/src/.htaccess#L42-L45
                    // https://github.com/ProtonMail/WebClients/blob/38397839bdf9c14f7c0c8af5cef46122ec399cb2/applications/drive/src/.htaccess#L36
                    /* eslint-enable max-len */
                    callbackResponse.headers = {
                        "Service-Worker-Allowed": "/",
                        "Service-Worker": "script",
                    };
                }

                callback(callbackResponse);
            },
        );
        if (!registered) {
            throw new Error(`Failed to register "${scheme}" protocol mapped to "${directory}" directory`);
        }
    }
}
