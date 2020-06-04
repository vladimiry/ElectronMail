import fs from "fs";
import mimeTypes from "mime-types";
import path from "path";
import pathIsInside from "path-is-inside";
import {Session, app, protocol} from "electron";
import {URL} from "url";
import {promisify} from "util";

import {Context} from "src/electron-main/model";
import {WEB_PROTOCOL_SCHEME} from "src/shared/constants";
import {resolveOrRejectIfError} from "src/shared/util";

const fsAsync = {
    stat: promisify(fs.stat),
    readFile: promisify(fs.readFile),
} as const;

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
            },
        })),
    );
}

// TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
export async function registerWebFolderFileProtocol(ctx: Context, session: Session): Promise<void> {
    const webPath = path.join(ctx.locations.appDir, "./web");

    return new Promise((resolve, reject) => {
        session.protocol.registerFileProtocol(
            WEB_PROTOCOL_SCHEME,
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
            resolveOrRejectIfError(resolve, reject),
        );
    });
}

async function resolveFileSystemResourceLocation(
    directory: string,
    request: Parameters<Parameters<(typeof protocol)["registerBufferProtocol"]>[1]>[0],
): Promise<string> {
    const resource = path.join(directory, new URL(request.url).pathname);

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
        if (error.code === "ENOENT") {
            return path.join(directory, "index.html");
        }
        throw error;
    }

    throw new Error(`Failed to resolve "${resource}" file system resource`);
}

export async function registerSessionProtocols(ctx: Context, session: Session): Promise<void> {
    // TODO setup timeout on "ready" even firing
    await app.whenReady();

    for (const {scheme, directory} of ctx.locations.protocolBundles) {
        await new Promise((resolve, reject) => {
            session.protocol.registerBufferProtocol(
                scheme,
                async (request, callback) => {
                    const file = await resolveFileSystemResourceLocation(directory, request);
                    const data = await fsAsync.readFile(file);
                    const mimeType = mimeTypes.lookup(path.basename(file));
                    const result = mimeType
                        ? {data, mimeType}
                        : data;

                    callback(result);
                },
                resolveOrRejectIfError(resolve, reject),
            );
        });
    }
}
