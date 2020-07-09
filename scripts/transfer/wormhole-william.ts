import fs from "fs";
import fsExtra from "fs-extra";
import mkdirp from "mkdirp";
import os from "os";
import path from "path";
import {promisify} from "util";

import {CWD, LOG, LOG_LEVELS, execShell, fetchUrl} from "scripts/lib";

const SERVICE_NAME = "wormhole-william";
const SERVICE_VERSION = "1.0.3";
const SERVICE_BINARY_DOWNLOAD_URL_PREFIX = `https://github.com/psanford/${SERVICE_NAME}/releases/download/v${SERVICE_VERSION}`;

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | string, string];

async function resolveCommand(): Promise<{ command: string }> {
    const binaryFile = path.resolve(
        CWD,
        "./output",
        (() => {
            const fileNames: Record<Extract<ReturnType<typeof os.platform>, "darwin" | "linux" | "win32">, string> = Object.freeze({
                darwin: "wormhole-william-darwin-amd64",
                linux: "wormhole-william-linux-amd64",
                win32: "wormhole-william-windows-386.exe",
            });
            const platform = os.platform();
            if (platform in fileNames) {
                return fileNames[platform as keyof typeof fileNames];
            }
            throw new Error(`Failed to resolve SERVICE binary name for ${platform} platform`);
        })(),
    );
    const returnExecutableCommand: () => Promise<{ command: string }> = async () => {
        if (!(await fsExtra.pathExists(binaryFile))) {
            throw new Error(`Failed to resolve "${binaryFile}" file`);
        }
        if (os.platform() !== "win32") {
            await execShell(["chmod", ["+x", binaryFile]]);
        }
        return {command: binaryFile};
    };

    if (await fsExtra.pathExists(binaryFile)) {
        LOG(
            LOG_LEVELS.title(`Binary ${LOG_LEVELS.value(binaryFile)} exists`),
        );
        return returnExecutableCommand();
    }

    await (async () => {
        const url = `${SERVICE_BINARY_DOWNLOAD_URL_PREFIX}/${path.basename(binaryFile)}`;
        const response = await fetchUrl([url]);

        mkdirp.sync(path.dirname(binaryFile));
        await promisify(fs.writeFile)(binaryFile, await response.buffer());

        if (!(await fsExtra.pathExists(binaryFile))) {
            throw new Error(`Failed to save ${url} to ${binaryFile} file`);
        }
    })();

    return returnExecutableCommand();
}

async function uploadFileArg(): Promise<{ downloadCodePhrase: string }> {
    const {command} = await resolveCommand();
    const {stdout: downloadCodePhrase} = await execShell([
        command,
        [
            "send",
            FILE_ARG,
        ],
    ]);

    return {downloadCodePhrase};
}

(async () => {
    if (ACTION_TYPE_ARG !== "upload") {
        throw new Error(`Unsupported action type: ${LOG_LEVELS.value(ACTION_TYPE_ARG)}`);
    }
    await uploadFileArg();
})().catch((error) => {
    LOG(error);
    process.exit(1);
});
