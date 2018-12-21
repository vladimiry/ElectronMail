import _logger from "electron-log";
import fs from "fs";
import mimeTypes from "mime-types";
import path from "path";
import pathIsInside from "path-is-inside";
import url from "url";
import {PassThrough} from "stream";
import {RegisterFileProtocolRequest, app, protocol} from "electron";
import {promisify} from "util";

import {curryFunctionMembers} from "src/shared/util";
import {getDefaultSession} from "./session";

const logger = curryFunctionMembers(_logger, "[electron-main/protocol]");
const fsStatAsync = promisify(fs.stat);

export function registerProtocols(protocolBundles: Array<{ scheme: string; directory: string }>) {
    // WARN: "protocol.registerStandardSchemes" needs to be called once, see https://github.com/electron/electron/issues/15943
    protocol.registerStandardSchemes(protocolBundles.map(({scheme}) => scheme), {secure: true});

    app.on("ready", () => {
        const {protocol: sessionProtocol} = getDefaultSession();

        for (const {scheme, directory} of protocolBundles) {
            sessionProtocol.registerStreamProtocol(
                scheme,
                async (request, callback) => {
                    const file = await resolveFileSystemResourceLocation(directory, request);
                    const contentType = mimeTypes.contentType(path.basename(file));
                    const callbackReader = new PassThrough();

                    callback({
                        statusCode: 200,
                        headers: {
                            ...(contentType && {"Content-Type": contentType}),
                        },
                        data: callbackReader,
                    });

                    fs.createReadStream(file)
                        .on("error", (error) => {
                            logger.error(`Error "${file}" file reading`, error);
                        })
                        .on("data", (data) => {
                            callbackReader.push(data);
                        })
                        .on("close", () => {
                            // TODO get rid of "setTimeout" call, see https://github.com/electron/electron/issues/13519
                            setTimeout(
                                () => {
                                    callbackReader.end();
                                },
                                // some value > 50 usually works (tested on up to 4Mb files)
                                // but increasing might be needed if serving large files
                                350,
                            );
                        });
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
        const stat = await fsStatAsync(resource);

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
