import os from "os";
import path from "path";

import {catchTopLeventAsync, execShell, resolveExecutable} from "scripts/lib";

const SERVICE_NAME = "wormhole-william";
const SERVICE_VERSION = "1.0.4";
const SERVICE_BINARY_DOWNLOAD_URL_PREFIX = `https://github.com/psanford/${SERVICE_NAME}/releases/download/v${SERVICE_VERSION}`;

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | string, string];

async function resolveCommand(): Promise<{command: string}> {
    const binaryBundle = (() => {
        const fileNames = {
            darwin: {postfix: "darwin-amd64", sha256: "048383785da82faa484bf85149989429ecb90f9f756b4d58f5926748649d6532"},
            linux: {postfix: "linux-amd64", sha256: "1dbb936fcecdc07e9bd8463e97da282db5c8acee864661ed689a5ce40a64ffdb"},
            win32: {postfix: "windows-386.exe", sha256: "3ed85cf51f5c17b3dc56d164959751c2808188554b00ca33d5856543758fb905"},
        } as const;
        const platform = os.platform();
        const resolvedItem: typeof fileNames[keyof typeof fileNames] | undefined = fileNames[platform as (keyof typeof fileNames)];
        if (resolvedItem) {
            return {fileName: `${SERVICE_NAME}-${resolvedItem.postfix}`, sha256: resolvedItem.sha256} as const;
        }
        throw new Error(`Failed to resolve binary name for ${platform} platform`);
    })();

    return resolveExecutable(
        `${SERVICE_BINARY_DOWNLOAD_URL_PREFIX}/${path.basename(binaryBundle.fileName)}`,
        binaryBundle.sha256,
        "wormhole-william",
    );
}

async function uploadFileArg(): Promise<{downloadCodePhrase: string}> {
    const {command} = await resolveCommand();
    const {stdout: downloadCodePhrase} = await execShell([command, ["send", FILE_ARG]]);

    return {downloadCodePhrase};
}

catchTopLeventAsync(async () => {
    if (ACTION_TYPE_ARG !== "upload") {
        throw new Error(`Unsupported action type: ${ACTION_TYPE_ARG}`);
    }
    await uploadFileArg();
});
