import byline from "byline";
import chalk from "chalk";
import path from "path";
import spawnAsync from "@expo/spawn-async";

import {Arguments} from "src/shared/types";

export const processCwd = path.resolve(process.cwd());

// tslint:disable-next-line:no-console
export const consoleLog = console.log;

export const consoleLevels = {
    error: chalk.red,
    warning: chalk.yellow,
    title: chalk.magenta,
    value: chalk.cyan,
};

export async function execShell(args: Arguments<typeof spawnAsync>) {
    consoleLog(consoleLevels.title(`Executing Shell command:`), consoleLevels.value(JSON.stringify(args)));

    const taskPromise = spawnAsync(...args);

    byline(taskPromise.child.stdout).on("data", (chunk) => consoleLog(formatStreamChunk(chunk)));
    byline(taskPromise.child.stderr).on("data", (chunk) => consoleLog(consoleLevels.error(formatStreamChunk(chunk))));
    taskPromise.child.on("uncaughtException", (error) => {
        consoleLog(
            consoleLevels.error(`Failed Shell command execution (uncaught exception): ${JSON.stringify(args)}`),
            consoleLevels.error(error),
        );
        process.exit(1);
    });

    try {
        const {status: exitCode} = await taskPromise;

        if (exitCode) {
            consoleLog(consoleLevels.error(`Failed Shell command execution (${exitCode} exit code): ${JSON.stringify(args)}`));
            process.exit(exitCode);
        }
    } catch (error) {
        consoleLog(consoleLevels.error(`Failed Shell command execution: ${JSON.stringify(args)}`), consoleLevels.error(error.stack));
        process.exit(1);
    }
}

export function formatStreamChunk(chunk: any): string {
    return Buffer.from(chunk, "UTF-8").toString();
}
