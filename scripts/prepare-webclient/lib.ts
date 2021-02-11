import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import pathIsInside from "path-is-inside";

import {CONSOLE_LOG, execShell, resolveGitCommitInfo, resolveGitOutputBackupDir} from "scripts/lib";
import {CWD_ABSOLUTE_DIR, GIT_CLONE_ABSOLUTE_DIR} from "scripts/const";
import {PROVIDER_REPO_MAP} from "src/shared/proton-apps-constants";
import {RUNTIME_ENV_CI_PROTON_CLIENTS_ONLY, WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/constants";

const shouldFailOnBuildEnvVarName = "ELECTRON_MAIL_SHOULD_FAIL_ON_BUILD";

const shouldFailOnBuild = Boolean(process.env[shouldFailOnBuildEnvVarName]);

const reposOnlyFilter: DeepReadonly<{ value: Array<keyof typeof PROVIDER_REPO_MAP>, envVariableName: string }> = (() => {
    const envVariableName = RUNTIME_ENV_CI_PROTON_CLIENTS_ONLY;
    const envVariableValue = process.env[envVariableName];
    const result = envVariableValue
        ? envVariableValue
            .split(";")
            .map((value) => value.trim())
            .filter((value) => value in PROVIDER_REPO_MAP)
            .map((value) => value as keyof typeof PROVIDER_REPO_MAP)
        : [];
    CONSOLE_LOG(`${envVariableName} env variable (raw string):`, envVariableValue, "(filtered array):", result);
    return {value: result, envVariableName};
})();

const [, , BASE_DEST_DIR] = process.argv;

if (!BASE_DEST_DIR) {
    throw new Error("Empty base destination directory argument");
}

if (!pathIsInside(path.resolve(CWD_ABSOLUTE_DIR, BASE_DEST_DIR), CWD_ABSOLUTE_DIR)) {
    throw new Error(`Invalid base destination directory argument value: ${BASE_DEST_DIR}`);
}

export interface FolderAsDomainEntry<T extends any = any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    folderNameAsDomain: string;
    options: T;
}

export type Flow<O> = (
    arg: {
        repoDir: string;
        folderAsDomainEntry: FolderAsDomainEntry<O>;
    },
) => Promise<void>;

async function clone(repoType: keyof typeof PROVIDER_REPO_MAP, dir: string): Promise<void> {
    const {repo, commit} = PROVIDER_REPO_MAP[repoType];

    fsExtra.ensureDirSync(dir);

    await execShell(["git", ["clone", repo, dir]]);
    await execShell(["git", ["checkout", commit], {cwd: dir}]);
    await execShell(["git", ["show", "--summary"], {cwd: dir}]);
}

export function printAndWriteFile(file: string, content: Buffer | string): void {
    CONSOLE_LOG(`Writing ${file} file with content:`, content);
    fsExtra.ensureDirSync(path.dirname(file));
    fs.writeFileSync(file, content);
}

async function cleanDestAndMoveToIt({src, dest}: { src: string, dest: string }): Promise<void> {
    CONSOLE_LOG(`Moving ${src} to ${dest} (cleaning destination dir before)`);
    await execShell(["npx", ["--no-install", "rimraf", dest]]);
    await fsExtra.move(src, dest);
}

export async function executeBuildFlow<T extends FolderAsDomainEntry[], O = Unpacked<T>["options"]>(
    {
        repoType,
        folderAsDomainEntries,
        repoRelativeDistDir = PROVIDER_REPO_MAP[repoType].repoRelativeDistDir,
        destSubFolder,
        flow,
    }: {
        repoType: keyof typeof PROVIDER_REPO_MAP;
        folderAsDomainEntries: T;
        repoRelativeDistDir?: string;
        destSubFolder: string;
        flow: {
            postClone?: Flow<O>;
            install?: Flow<O>;
            build: Flow<O>;
        };
    },
): Promise<void> {
    if (
        reposOnlyFilter.value.length
        &&
        !reposOnlyFilter.value.includes(repoType)
    ) {
        CONSOLE_LOG(`Skip "${repoType}" processing as not explicitly listed in "${reposOnlyFilter.envVariableName}" env variable`);
        return;
    }

    const repoDir = path.join(GIT_CLONE_ABSOLUTE_DIR, repoType);

    for (const folderAsDomainEntry of folderAsDomainEntries) {
        const targetDistDir = path.resolve(BASE_DEST_DIR as string, folderAsDomainEntry.folderNameAsDomain, destSubFolder);

        CONSOLE_LOG(
            `Prepare web client build [${repoType}]:`,
            JSON.stringify({...folderAsDomainEntry, resolvedDistDir: targetDistDir}),
        );

        if (fsExtra.pathExistsSync(path.join(targetDistDir, "index.html"))) {
            CONSOLE_LOG("Skip building as directory already exists:", targetDistDir);
            continue;
        }

        const repoDistDir = path.resolve(repoDir, repoRelativeDistDir);
        const flowOptions = {repoDir, folderAsDomainEntry} as const;
        const cloneRequired = await (async () => {
            const dirExists = fsExtra.pathExistsSync(repoDir);
            const {commit: expectedCommit} = PROVIDER_REPO_MAP[repoType];
            if (dirExists) {
                const {commit: repoDirCommit} = await resolveGitCommitInfo({dir: repoDir});
                if (repoDirCommit === expectedCommit) {
                    return false;
                }
                // backup current repo dir since commits don't match
                await cleanDestAndMoveToIt({
                    src: repoDir,
                    dest: resolveGitOutputBackupDir({repoType, commit: repoDirCommit}),
                });
                return true;
            }
            const existingBackupDir = resolveGitOutputBackupDir({repoType});
            if (fsExtra.pathExistsSync(existingBackupDir)) { // maybe we have backup-ed it before
                const src = existingBackupDir;
                const dest = repoDir;
                CONSOLE_LOG(`Copying backup ${src} to ${dest}`);
                await fsExtra.copy(src, dest);
                return false;
            }
            return true;
        })();

        fsExtra.ensureDirSync(repoDir);

        if (cloneRequired) {
            await clone(repoType, repoDir);
            if (flow.postClone) {
                await flow.postClone(flowOptions);
            }
        } else {
            CONSOLE_LOG("Skip cloning");
        }

        // making sure dist dir doesn't exist before executing a new build or taking it from backup
        await execShell(["npx", ["--no-install", "rimraf", repoDistDir]]);

        const repoDistBackupDir = resolveGitOutputBackupDir({repoType, suffix: `dist-${folderAsDomainEntry.folderNameAsDomain}`});

        if (fsExtra.pathExistsSync(repoDistBackupDir)) { // taking dist from the backup
            const src = repoDistBackupDir;
            const dest = repoDistDir;
            CONSOLE_LOG(`Copying backup ${src} to ${dest}`);
            await fsExtra.copy(src, dest);
        } else { // executing the build
            if (fsExtra.pathExistsSync(path.resolve(repoDir, "node_modules"))) {
                CONSOLE_LOG("Skip dependencies installing");
            } else if (flow.install) {
                await flow.install(flowOptions);
            } else {
                await execShell(["npm", ["ci"], {cwd: repoDir}]);
            }

            if (shouldFailOnBuild) {
                throw new Error(`Halting since "${shouldFailOnBuildEnvVarName}" env var has been enabled`);
            } else {
                await flow.build(flowOptions);
            }

            printAndWriteFile(
                path.join(repoDistDir, WEB_CLIENTS_BLANK_HTML_FILE_NAME),
                `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <title>Title</title>
                        </head>
                        <body>
                        </body>
                        </html>
                    `,
            );

            { // backup the dist
                const src = repoDistDir;
                const dest = repoDistBackupDir;
                await execShell(["npx", ["--no-install", "rimraf", dest]]);
                CONSOLE_LOG(`Backup ${src} to ${dest}`);
                await fsExtra.copy(src, dest);
            }
        }

        // move to destination folder
        await cleanDestAndMoveToIt({src: repoDistDir, dest: targetDistDir});
    }
}
