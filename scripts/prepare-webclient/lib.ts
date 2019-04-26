import byline from "byline";
import fsExtra from "fs-extra";
import path from "path";
import pathIsInside from "path-is-inside";
import {GitProcess} from "dugite";

import {AccountType} from "src/shared/model/account";
import {Arguments, Unpacked} from "src/shared/types";
import {LOG, LOG_LEVELS, PROC_CWD, execShell, formatStreamChunk} from "scripts/lib";
import {PROVIDER_REPO} from "src/shared/constants";

const [, , baseDestDir] = process.argv;

if (!baseDestDir) {
    throw new Error(`Empty base destination directory argument`);
}

if (!pathIsInside(path.resolve(PROC_CWD, baseDestDir), PROC_CWD)) {
    throw new Error(`Invalid base destination directory argument value: ${LOG_LEVELS.value(baseDestDir)}`);
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
    const distDir = path.resolve(baseDestDir, accountType);
    const webClientDir = path.resolve(PROC_CWD, `./output/git/${accountType}/webclient`);
    const baseRepoDir = path.resolve(PROC_CWD, webClientDir, `./${PROVIDER_REPO[accountType].commit}`);

    await fsExtra.ensureDir(webClientDir);

    for (const folderAsDomainEntry of folderAsDomainEntries) {
        const resolvedDistDir = path.resolve(distDir, folderAsDomainEntry.folderNameAsDomain);
        LOG(
            LOG_LEVELS.title(`Preparing built-in WebClient build [${accountType}]:`),
            LOG_LEVELS.value(JSON.stringify({...folderAsDomainEntry, resolvedDistDir})),
        );

        if (await fsExtra.pathExists(resolvedDistDir)) {
            LOG(LOG_LEVELS.warning(`Skipping as directory already exists:`), LOG_LEVELS.value(resolvedDistDir));
            continue;
        }

        const repoDir = path.resolve(baseRepoDir, folderAsDomainEntry.folderNameAsDomain);
        const repoDistDir = path.resolve(repoDir, repoRelativeDistDir);
        const flowArg = {repoDir, folderAsDomainEntry};

        if (await fsExtra.pathExists(repoDir)) {
            LOG(LOG_LEVELS.warning(`Skipping cloning`));
        } else {
            await fsExtra.ensureDir(repoDir);
            await clone(accountType, repoDir);
        }

        if (await fsExtra.pathExists(path.join(repoDistDir, "index.html"))) {
            LOG(LOG_LEVELS.warning(`Skipping building`));
        } else {
            if (await fsExtra.pathExists(path.resolve(repoDir, "node_modules"))) {
                LOG(LOG_LEVELS.warning(`Skipping dependencies installing`));
            } else {
                if (flows.preInstall) {
                    await flows.preInstall(flowArg);
                }
                await installDependencies(repoDir);
            }

            await flows.build(flowArg);
        }

        LOG(LOG_LEVELS.title(`Copying: ${LOG_LEVELS.value(repoDistDir)} to ${LOG_LEVELS.value(resolvedDistDir)}`));
        await fsExtra.copy(repoDistDir, resolvedDistDir);
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
                if (!stderr) {
                    return;
                }
                byline(stderr).on("data", (chunk) => LOG(formatStreamChunk(chunk)));
            },
            ...options,
        },
    ];
    LOG(LOG_LEVELS.title(`Executing Git command:`), LOG_LEVELS.value(JSON.stringify(args)));
    const result = await GitProcess.exec(...args);

    if (result.exitCode) {
        throw new Error(String(result.stderr).trim());
    }
}
