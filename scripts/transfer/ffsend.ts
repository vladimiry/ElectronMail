import os from "os";
import path from "path";

import {catchTopLeventAsync, execShell, resolveExecutable} from "scripts/lib";

const SERVICE_NAME = "ffsend";
const SERVICE_VERSION = "v0.2.71";
const SERVICE_BINARY_DOWNLOAD_URL_PREFIX = `https://github.com/timvisee/${SERVICE_NAME}/releases/download/${SERVICE_VERSION}`;
const SERVICE_DOWNLOAD_URL_PREFIX = "https://send.vis.ee/download/";
const SERVICE_DOWNLOAD_COUNT = "1"; // only 1 is supported in anonymous mode

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | string, string];

async function resolveCommand(): Promise<{ command: string }> {
    const binaryBundle = (() => {
        const fileNames = {
            darwin: {postfix: "macos", sha256: "8d96e00a7e8949069b59dfea7c65f76c40eaa98bae4beeb799e14e0c04438165"},
            linux: {postfix: "linux-x64-static", sha256: "a9cc69c204e34db452a66b18c36d748bcc98ccfcd2c9fd4e1c7cfdbbb18f7058"},
            win32: {postfix: "windows-x64-static.exe", sha256: "61bf05a5733458a80bab2b7f82d577dd85b72ca76f67319883df9449015c20e0"},
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

catchTopLeventAsync(async () => {
    if (ACTION_TYPE_ARG !== "upload") {
        throw new Error(`Unsupported action type: ${ACTION_TYPE_ARG}`);
    }
    await uploadFileArg();
});
