import fs from "fs";
import mimeTypes from "mime-types";
import path from "path";
import pathIsInside from "path-is-inside";
import url from "url";
import {RegisterFileProtocolRequest, Session, app, protocol} from "electron";
import {promisify} from "util";

import {Context} from "src/electron-main/model";

const fsAsync = {
    stat: promisify(fs.stat),
    readFile: promisify(fs.readFile),
};

const appReadyPromise = new Promise((resolve) => app.on("ready", resolve));

export function registerStandardSchemes(ctx: Context) {
    // WARN: "protocol.registerStandardSchemes" needs to be called once, see https://github.com/electron/electron/issues/15943
    protocol.registerStandardSchemes(
        ctx.locations.protocolBundles.map(({scheme}) => scheme),
        {secure: true},
    );
}

export async function registerSessionProtocols(ctx: Context, session: Session): Promise<void> {
    await appReadyPromise;

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
                (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                },
            );
        });
    }
}

async function resolveFileSystemResourceLocation(directory: string, request: RegisterFileProtocolRequest): Promise<string> {
    const resource = path.join(directory, new url.URL(request.url).pathname);

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
