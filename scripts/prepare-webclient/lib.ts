import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import pathIsInside from "path-is-inside";

import {CONSOLE_LOG, CWD, GIT_CLONE_ABSOLUTE_DIR, execShell, resolveGitCommitInfo} from "scripts/lib";
import {PROVIDER_REPO_MAP, RUNTIME_ENV_CI_PROTON_CLIENTS_ONLY, WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/constants";

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

if (!pathIsInside(path.resolve(CWD, BASE_DEST_DIR), CWD)) {
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

function resolveBackupDir(
    {
        repoType,
        commit = PROVIDER_REPO_MAP[repoType].commit,
        suffix,
    }: {
        repoType: keyof typeof PROVIDER_REPO_MAP,
        commit?: string,
        suffix?: string,
    },
): string {
    return path.join(
        GIT_CLONE_ABSOLUTE_DIR,
        "./backup",
        repoType,
        `./${commit.substr(0, 7)}${suffix ? ("-" + suffix) : ""}`,
    );
}

export async function executeBuildFlow<T extends FolderAsDomainEntry[], O = Unpacked<T>["options"]>(
    {
        repoType,
        folderAsDomainEntries,
        repoRelativeDistDir = PROVIDER_REPO_MAP[repoType].repoRelativeDistDir,
        destSubFolder,
        flows: {
            postClone,
            install,
            build,
        },
    }: {
        repoType: keyof typeof PROVIDER_REPO_MAP;
        folderAsDomainEntries: T;
        repoRelativeDistDir?: string;
        destSubFolder: string;
        flows: {
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
        const targetDistDir = path.resolve(BASE_DEST_DIR, folderAsDomainEntry.folderNameAsDomain, destSubFolder);

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
                    dest: resolveBackupDir({repoType, commit: repoDirCommit}),
                });
                return true;
            }
            const existingBackupDir = resolveBackupDir({repoType});
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
            if (postClone) {
                await postClone(flowOptions);
            }
        } else {
            CONSOLE_LOG("Skip cloning");
        }

        // making sure dist dir doesn't exist before executing a new build or taking it from backup
        await execShell(["npx", ["--no-install", "rimraf", repoDistDir]]);

        const repoDistBackupDir = resolveBackupDir({repoType, suffix: `dist-${folderAsDomainEntry.folderNameAsDomain}`});

        if (fsExtra.pathExistsSync(repoDistBackupDir)) { // taking dist from the backup
            const src = repoDistBackupDir;
            const dest = repoDistDir;
            CONSOLE_LOG(`Copying backup ${src} to ${dest}`);
            await fsExtra.copy(src, dest);
        } else { // executing the build
            if (fsExtra.pathExistsSync(path.resolve(repoDir, "node_modules"))) {
                CONSOLE_LOG("Skip dependencies installing");
            } else if (install) {
                await install(flowOptions);
            } else {
                await execShell(["npm", ["ci"], {cwd: repoDir}]);
            }

            await build(flowOptions);

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
