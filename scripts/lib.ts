import byline from "byline";
import chalk from "chalk";
import fetch from "node-fetch";
import path from "path";
import spawnAsync from "@expo/spawn-async";
import {pick} from "ramda";

import {Arguments, Unpacked} from "src/shared/types";

export const PROC_CWD = path.resolve(process.cwd());

// tslint:disable-next-line:no-console
export const LOG = console.log;

export const LOG_LEVELS = {
    error: chalk.red,
    warning: chalk.yellow,
    title: chalk.magenta,
    value: chalk.cyan,
};

export async function execShell(
    args: Arguments<typeof spawnAsync>,
    {printStd = true}: { printStd?: boolean } = {},
): Promise<Unpacked<ReturnType<typeof spawnAsync>>> {
    LOG(LOG_LEVELS.title(`Executing Shell command:`), LOG_LEVELS.value(JSON.stringify(args)));

    const spawnPromise = spawnAsync(...args);

    if (printStd) {
        if (spawnPromise.child.stdout) {
            byline(spawnPromise.child.stdout).on("data", (chunk) => {
                LOG(LOG_LEVELS.value(formatStreamChunk(chunk)));
            });
        }
        if (spawnPromise.child.stderr) {
            byline(spawnPromise.child.stderr).on("data", (chunk) => {
                LOG(LOG_LEVELS.error(formatStreamChunk(chunk)));
            });
        }
    }

    return await spawnPromise;
}

export function formatStreamChunk(chunk: any): string {
    return Buffer.from(chunk, "utf-8").toString();
}

export async function fetchUrl(args: Arguments<typeof fetch>): ReturnType<typeof fetch> {
    const [urlOrRequest] = args;
    const url = typeof urlOrRequest === "string"
        ? urlOrRequest
        : urlOrRequest.url;

    LOG(LOG_LEVELS.title(`Downloading ${LOG_LEVELS.value(url)}`));

    const response = await fetch(...args);

    if (!response.ok) {
        throw new Error(`Downloading failed: ${JSON.stringify(pick(["status", "statusText"], response))}`);
    }

    return response;
}
