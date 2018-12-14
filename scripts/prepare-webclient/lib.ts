import byline from "byline";
import chalk from "chalk";
import fsExtra from "fs-extra";
import path from "path";
import pathIsInside from "path-is-inside";
import spawnAsync from "@expo/spawn-async";
import {GitProcess} from "dugite";

import {AccountType} from "src/shared/model/account";
import {Arguments, Unpacked} from "src/shared/types";
import {PROVIDER_REPO} from "src/shared/constants";

// tslint:disable-next-line:no-console
export const consoleLog = console.log;
// tslint:disable-next-line:no-console
export const consoleError = console.error;
export const chalkConsoleValue = (value: string) => chalk.cyan(value);

const baseDestDir = process.argv[2];

if (!baseDestDir) {
    throw new Error(`Empty base destination directory argument`);
}

if (!pathIsInside(path.resolve(process.cwd(), baseDestDir), process.cwd())) {
    throw new Error(`Invalid base destination directory argument value: "${baseDestDir}"`);
}

export interface FolderAsDomainEntry<T extends any = any> {
    folderNameAsDomain: string;
    options: T;
}

export type Flow<O> = (
    arg: {
        repoDir: string;
        repoDistDir: string;
        folderAsDomainEntry: FolderAsDomainEntry<O>;
    },
) => Promise<void>;

export async function execAccountTypeFlow<T extends FolderAsDomainEntry[], O = Unpacked<T>["options"]>(
    {
        accountType,
        folderAsDomainEntries,
        repoRelativeDistDir,
        flow,
    }: {
        accountType: AccountType,
        folderAsDomainEntries: T,
        repoRelativeDistDir: string,
        flow: Flow<O>,
    },
) {
    try {
        const distDir = path.resolve(baseDestDir, accountType);
        const baseRepoDir = path.resolve(process.cwd(), `./output/git/${accountType}/webclient/${PROVIDER_REPO[accountType].commit}`);

        for (const folderAsDomainEntry of folderAsDomainEntries) {
            const resolvedDistDir = path.resolve(distDir, folderAsDomainEntry.folderNameAsDomain);
            consoleLog(
                chalk.magenta(`Preparing built-in WebClient build [${accountType}]:`),
                chalkConsoleValue(JSON.stringify({...folderAsDomainEntry, resolvedDistDir})),
            );

            if (await fsExtra.pathExists(resolvedDistDir)) {
                consoleLog(chalk.yellow(`Skipping as directory already exists:`), chalkConsoleValue(resolvedDistDir));
                continue;
            }

            const repoDir = path.resolve(baseRepoDir, folderAsDomainEntry.folderNameAsDomain);
            const repoDistDir = path.resolve(repoDir, repoRelativeDistDir);

            if (await fsExtra.pathExists(repoDir)) {
                consoleLog(chalk.yellow(`Skipping cloning`));
            } else {
                await fsExtra.ensureDir(repoDir);
                await clone(accountType, repoDir);
            }

            if (await fsExtra.pathExists(path.resolve(repoDir, "node_modules"))) {
                consoleLog(chalk.yellow(`Skipping dependencies installing`));
            } else {
                await installDependencies(repoDir);
            }

            await flow({repoDir, repoDistDir, folderAsDomainEntry});

            consoleLog(chalk.magenta(`Copying:`), chalkConsoleValue(`${repoDistDir}" to "${resolvedDistDir}`));
            await fsExtra.copy(repoDistDir, resolvedDistDir);
        }
    } catch (error) {
        consoleError("Uncaught exception", error);
        process.exit(1);
    }
}

async function installDependencies(dir: string) {
    await execShell(["npm", ["install"], {cwd: dir}]);
}

async function clone(accountType: AccountType, destDir: string) {
    const {repo, commit} = PROVIDER_REPO[accountType];

    await execGit([
        ["clone", "--progress", repo, "."],
        destDir,
    ]);
    await execGit([
        ["checkout", commit],
        destDir,
    ]);
    // TODO call "execGit" instead of "execShell"
    await execShell(["git", ["show", "--summary"], {cwd: destDir}]);
}

export async function execGit([commands, pathArg, options]: Arguments<typeof GitProcess.exec>) {
    const args: Arguments<typeof GitProcess.exec> = [
        commands,
        pathArg,
        {
            processCallback: ({stderr}) => {
                byline(stderr).on("data", (chunk) => consoleLog(formatStreamChunk(chunk)));
            },
            ...options,
        },
    ];
    consoleLog(chalk.magenta(`Executing Git command:`), chalkConsoleValue(JSON.stringify(args)));
    const result = await GitProcess.exec(...args);

    if (result.exitCode) {
        throw new Error(String(result.stderr).trim());
    }
}

export async function execShell(args: Arguments<typeof spawnAsync>) {
    consoleLog(chalk.magenta(`Executing Shell command:`), chalkConsoleValue(JSON.stringify(args)));

    const taskPromise = spawnAsync(...args);

    byline(taskPromise.child.stdout).on("data", (chunk) => consoleLog(formatStreamChunk(chunk)));
    byline(taskPromise.child.stderr).on("data", (chunk) => consoleError(formatStreamChunk(chunk)));
    taskPromise.child.on("uncaughtException", (error) => {
        consoleError(`Failed Shell command execution (uncaught exception): ${JSON.stringify(args)}`, error);
        process.exit(1);
    });

    try {
        const {status: exitCode} = await taskPromise;

        if (exitCode) {
            consoleError(`Failed Shell command execution (${exitCode} exit code): ${JSON.stringify(args)}`);
            process.exit(exitCode);
        }
    } catch (error) {
        consoleError(`Failed Shell command execution: ${JSON.stringify(args)}`, error.stack);
        process.exit(1);
    }
}

function formatStreamChunk(chunk: any): string {
    return Buffer.from(chunk, "UTF-8").toString();
}
