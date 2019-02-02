import byline from "byline";
import fsExtra from "fs-extra";
import path from "path";
import pathIsInside from "path-is-inside";
import {GitProcess} from "dugite";

import {AccountType} from "src/shared/model/account";
import {Arguments, Unpacked} from "src/shared/types";
import {PROVIDER_REPO} from "src/shared/constants";
import {consoleLevels, consoleLog, execShell, formatStreamChunk, processCwd} from "scripts/lib";

const [, , baseDestDir] = process.argv;

if (!baseDestDir) {
    throw new Error(`Empty base destination directory argument`);
}

if (!pathIsInside(path.resolve(processCwd, baseDestDir), processCwd)) {
    throw new Error(`Invalid base destination directory argument value: ${consoleLevels.value(baseDestDir)}`);
}

export interface FolderAsDomainEntry<T extends any = any> {
    folderNameAsDomain: string;
    options: T;
}

export type Flow<O> = (
    arg: {
        repoDir: string;
        folderAsDomainEntry: FolderAsDomainEntry<O>;
    },
) => Promise<void>;

export async function execAccountTypeFlow<T extends FolderAsDomainEntry[], O = Unpacked<T>["options"]>(
    {
        accountType,
        folderAsDomainEntries,
        repoRelativeDistDir,
        flows,
    }: {
        accountType: AccountType,
        folderAsDomainEntries: T,
        repoRelativeDistDir: string,
        flows: {
            preInstall?: Flow<O>;
            build: Flow<O>;
        },
    },
) {
    try {
        const distDir = path.resolve(baseDestDir, accountType);
        const webClientDir = path.resolve(processCwd, `./output/git/${accountType}/webclient`);
        const baseRepoDir = path.resolve(processCwd, webClientDir, `./${PROVIDER_REPO[accountType].commit}`);

        await fsExtra.ensureDir(webClientDir);

        for (const folderAsDomainEntry of folderAsDomainEntries) {
            const resolvedDistDir = path.resolve(distDir, folderAsDomainEntry.folderNameAsDomain);
            consoleLog(
                consoleLevels.title(`Preparing built-in WebClient build [${accountType}]:`),
                consoleLevels.value(JSON.stringify({...folderAsDomainEntry, resolvedDistDir})),
            );

            if (await fsExtra.pathExists(resolvedDistDir)) {
                consoleLog(consoleLevels.warning(`Skipping as directory already exists:`), consoleLevels.value(resolvedDistDir));
                continue;
            }

            const repoDir = path.resolve(baseRepoDir, folderAsDomainEntry.folderNameAsDomain);
            const repoDistDir = path.resolve(repoDir, repoRelativeDistDir);
            const flowArg = {repoDir, folderAsDomainEntry};

            if (await fsExtra.pathExists(repoDir)) {
                consoleLog(consoleLevels.warning(`Skipping cloning`));
            } else {
                await fsExtra.ensureDir(repoDir);
                await clone(accountType, repoDir);
            }

            if (await fsExtra.pathExists(path.join(repoDistDir, "index.html"))) {
                consoleLog(consoleLevels.warning(`Skipping building`));
            } else {
                if (await fsExtra.pathExists(path.resolve(repoDir, "node_modules"))) {
                    consoleLog(consoleLevels.warning(`Skipping dependencies installing`));
                } else {
                    if (flows.preInstall) {
                        await flows.preInstall(flowArg);
                    }
                    await installDependencies(repoDir);
                }

                await flows.build(flowArg);
            }

            consoleLog(consoleLevels.title(`Copying: ${consoleLevels.value(repoDistDir)} to ${consoleLevels.value(resolvedDistDir)}`));
            await fsExtra.copy(repoDistDir, resolvedDistDir);
        }
    } catch (error) {
        consoleLog(consoleLevels.error("Uncaught exception"), consoleLevels.error(error));
        process.exit(1);
    }
}

async function installDependencies(dir: string) {
    await execShell(["npm", ["ci"], {cwd: dir}]);
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
    consoleLog(consoleLevels.title(`Executing Git command:`), consoleLevels.value(JSON.stringify(args)));
    const result = await GitProcess.exec(...args);

    if (result.exitCode) {
        throw new Error(String(result.stderr).trim());
    }
}
