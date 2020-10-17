import os from "os";
import path from "path";

import {CONSOLE_LOG, execShell, resolveExecutable} from "scripts/lib";

const SERVICE_NAME = "ffsend";
const SERVICE_VERSION = "v0.2.68";
const SERVICE_BINARY_DOWNLOAD_URL_PREFIX = `https://github.com/timvisee/${SERVICE_NAME}/releases/download/${SERVICE_VERSION}`;
const SERVICE_DOWNLOAD_URL_PREFIX = "https://send.vis.ee/download/";
const SERVICE_DOWNLOAD_COUNT = "1"; // only 1 is supported in anonymous mode

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | string, string];

async function resolveCommand(): Promise<{ command: string }> {
    const binaryBundle = (() => {
        const fileNames = {
            darwin: {postfix: "macos", sha256: "d7c9b098c81a7112efb3d92439b326145576ebaa9ff301be17b397a49286a386"},
            linux: {postfix: "linux-x64-static", sha256: "f5f5233d977dc39c23057bf62a3d01924636eab9e9243b996f73bcdf8f3d3ce5"},
            win32: {postfix: "windows-x64-static.exe", sha256: "2452a79340dddbeb91fb04e436e85927f39597643456221ecb68ec370205a954"},
        } as const;
        const platform = os.platform();
        const resolvedItem: typeof fileNames[keyof typeof fileNames] | undefined = fileNames[platform as (keyof typeof fileNames)];
        if (resolvedItem) {
            return {
                fileName: `${SERVICE_NAME}-${SERVICE_VERSION}-${resolvedItem.postfix}`,
                sha256: resolvedItem.sha256,
            } as const;
        }
        throw new Error(`Failed to resolve binary name for ${platform} platform`);
    })();

    return resolveExecutable(
        `${SERVICE_BINARY_DOWNLOAD_URL_PREFIX}/${path.basename(binaryBundle.fileName)}`,
        binaryBundle.sha256,
        "ffsend",
    );
}

async function uploadFileArg(): Promise<{ downloadUrl: string }> {
    const {command} = await resolveCommand();
    const {stdout: downloadUrl} = await execShell([
        command,
        [
            "upload",
            "--no-interact",
            "--incognito",
            "--downloads", SERVICE_DOWNLOAD_COUNT,
            FILE_ARG,
        ],
    ]);

    if (!downloadUrl.startsWith(SERVICE_DOWNLOAD_URL_PREFIX)) {
        throw new Error(`Download url "${downloadUrl}" doesn't start from "${SERVICE_DOWNLOAD_URL_PREFIX}"`);
    }

    return {downloadUrl};
}

(async () => {
    if (ACTION_TYPE_ARG !== "upload") {
        throw new Error(`Unsupported action type: ${ACTION_TYPE_ARG}`);
    }
    await uploadFileArg();
})().catch((error) => {
    CONSOLE_LOG(error);
    process.exit(1);
});
