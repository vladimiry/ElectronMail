import fs from "fs";
import path from "path";
import pathIsInside from "path-is-inside";
import url from "url";
import {RegisterFileProtocolRequest, app, protocol} from "electron";
import {promisify} from "util";

import {getDefaultSession} from "./session";

const fsStatAsync = promisify(fs.stat);

export function registerFileProtocols(protocolBundles: Array<{ scheme: string; directory: string }>) {
    // WARN: "protocol.registerStandardSchemes" needs to be called once
    protocol.registerStandardSchemes(protocolBundles.map(({scheme}) => scheme), {secure: true});

    app.on("ready", () => {
        const {protocol: sessionProtocol} = getDefaultSession();

        for (const {scheme, directory} of protocolBundles) {
            sessionProtocol.registerFileProtocol(
                scheme,
                async (request, callback) => {
                    callback(
                        await resolveFileSystemResource(directory, request),
                    );
                },
                (error) => {
                    if (error) {
                        throw error;
                    }
                });
        }
    });
}

async function resolveFileSystemResource(directory: string, request: RegisterFileProtocolRequest): Promise<string> {
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
