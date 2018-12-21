import _logger from "electron-log";
import fs from "fs";
import mimeTypes from "mime-types";
import path from "path";
import pathIsInside from "path-is-inside";
import url from "url";
import {RegisterFileProtocolRequest, app, protocol} from "electron";
import {promisify} from "util";

import {curryFunctionMembers} from "src/shared/util";
import {getDefaultSession} from "./session";

const logger = curryFunctionMembers(_logger, "[electron-main/protocol]");
const fsAsync = {
    stat: promisify(fs.stat),
    readFile: promisify(fs.readFile),
};

export function registerProtocols(protocolBundles: Array<{ scheme: string; directory: string }>) {
    // WARN: "protocol.registerStandardSchemes" needs to be called once, see https://github.com/electron/electron/issues/15943
    protocol.registerStandardSchemes(protocolBundles.map(({scheme}) => scheme), {secure: true});

    app.on("ready", () => {
        const {protocol: sessionProtocol} = getDefaultSession();

        for (const {scheme, directory} of protocolBundles) {
            sessionProtocol.registerBufferProtocol(
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
                        logger.error(error);
                        throw error;
                    }
                });
        }
    });
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
