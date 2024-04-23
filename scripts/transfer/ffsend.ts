import os from "os";
import path from "path";

import {catchTopLeventAsync, execShell, resolveExecutable} from "scripts/lib";

const SERVICE_NAME = "ffsend";
const SERVICE_VERSION = "v0.2.74";
const SERVICE_BINARY_DOWNLOAD_URL_PREFIX = `https://github.com/timvisee/${SERVICE_NAME}/releases/download/${SERVICE_VERSION}`;
const SERVICE_DOWNLOAD_URL_PREFIX = "https://send.vis.ee/download/";
const SERVICE_DOWNLOAD_COUNT = "1"; // only 1 is supported in anonymous mode

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | string, string];

async function resolveCommand(): Promise<{command: string}> {
    const binaryBundle = (() => {
        const fileNames = {
            darwin: {postfix: "macos", sha256: "61d28a3f24dc3beb74e8b6d1de28bca760685b81bff907142c51e58f6bc8ff87"},
            linux: {postfix: "linux-x64-static", sha256: "cbb6f9229c0c63fbbedd8f906afc85c610a3513539b447564086bdef9b08a422"},
            win32: {postfix: "windows-x64-static.exe", sha256: "09d923348d083c130e8e26f990ba4c90022a2b26e6a9f0c55ac78420f84089f8"},
        } as const;
        const platform = os.platform();
        const resolvedItem: typeof fileNames[keyof typeof fileNames] | undefined = fileNames[platform as (keyof typeof fileNames)];
        if (resolvedItem) {
            return {fileName: `${SERVICE_NAME}-${SERVICE_VERSION}-${resolvedItem.postfix}`, sha256: resolvedItem.sha256} as const;
        }
        throw new Error(`Failed to resolve binary name for ${platform} platform`);
    })();

    return resolveExecutable(
        `${SERVICE_BINARY_DOWNLOAD_URL_PREFIX}/${path.basename(binaryBundle.fileName)}`,
        binaryBundle.sha256,
        "ffsend",
    );
}

async function uploadFileArg(): Promise<{downloadUrl: string}> {
    const {command} = await resolveCommand();
    const {stdout: downloadUrl} = await execShell([command, [
        "upload",
        "--no-interact",
        "--incognito",
        "--downloads",
        SERVICE_DOWNLOAD_COUNT,
        FILE_ARG,
    ]]);

    if (!downloadUrl.startsWith(SERVICE_DOWNLOAD_URL_PREFIX)) {
        throw new Error(`Download url "${downloadUrl}" doesn't start from "${SERVICE_DOWNLOAD_URL_PREFIX}"`);
    }

    return {downloadUrl};
}

catchTopLeventAsync(async () => {
    if (ACTION_TYPE_ARG !== "upload") {
        throw new Error(`Unsupported action type: ${ACTION_TYPE_ARG}`);
    }
    await uploadFileArg();
});
