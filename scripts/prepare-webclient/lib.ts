import fs from "fs";
import fsExtra from "fs-extra";
import mkdirp from "mkdirp";
import path from "path";
import pathIsInside from "path-is-inside";

import {CWD, LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {PROVIDER_REPOS, WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/constants";

const REPOS_ONLY_FILTER: ReadonlyArray<keyof typeof PROVIDER_REPOS> = (() => {
    const {ELECTRON_MAIL_PREPARE_WEBCLIENTS_REPOS_ONLY} = process.env;
    const result = ELECTRON_MAIL_PREPARE_WEBCLIENTS_REPOS_ONLY
        ? ELECTRON_MAIL_PREPARE_WEBCLIENTS_REPOS_ONLY
            .split(";")
            .map((value) => value.trim())
            .filter((value) => value in PROVIDER_REPOS)
            .map((value) => value as keyof typeof PROVIDER_REPOS)
        : [];
    LOG(
        LOG_LEVELS.title(`ELECTRON_MAIL_PREPARE_WEBCLIENTS_REPOS_ONLY (raw string):`),
        LOG_LEVELS.value(ELECTRON_MAIL_PREPARE_WEBCLIENTS_REPOS_ONLY),
        LOG_LEVELS.title(`(filtered array):`),
        LOG_LEVELS.value(result),
    );
    return result;
})();

const [, , BASE_DEST_DIR] = process.argv;

if (!BASE_DEST_DIR) {
    throw new Error(`Empty base destination directory argument`);
}

if (!pathIsInside(path.resolve(CWD, BASE_DEST_DIR), CWD)) {
    throw new Error(`Invalid base destination directory argument value: ${LOG_LEVELS.value(BASE_DEST_DIR)}`);
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

async function clone(repoType: keyof typeof PROVIDER_REPOS, dir: string): Promise<void> {
    const {repo, commit} = PROVIDER_REPOS[repoType];

    mkdirp.sync(dir);

    await execShell(["git", ["clone", repo, "."], {cwd: dir}]);
    await execShell(["git", ["checkout", commit], {cwd: dir}]);
    await execShell(["git", ["show", "--summary"], {cwd: dir}]);
}

export function printAndWriteFile(file: string, content: Buffer | string): void {
    LOG(
        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(file)} file with content:`),
        LOG_LEVELS.value(content),
    );
    mkdirp.sync(path.dirname(file));
    fs.writeFileSync(file, content);
}

export async function execAccountTypeFlow<T extends FolderAsDomainEntry[], O = Unpacked<T>["options"]>(
    {
        repoType,
        folderAsDomainEntries,
        repoRelativeDistDir = PROVIDER_REPOS[repoType].repoRelativeDistDir,
        destSubFolder,
        flows: {
            preInstall,
            install,
            build,
        },
    }: {
        repoType: keyof typeof PROVIDER_REPOS;
        folderAsDomainEntries: T;
        repoRelativeDistDir?: string;
        destSubFolder?: string;
        flows: {
            preInstall?: Flow<O>;
            install?: Flow<O>;
            build: Flow<O>;
        };
    },
): Promise<void> {
    if (
        REPOS_ONLY_FILTER.length
        &&
        !REPOS_ONLY_FILTER.includes(repoType)
    ) {
        LOG(
            LOG_LEVELS.warning(`Skipping "${LOG_LEVELS.value(repoType)}" processing as not explicitly listed in Env Variable`),
        );
        return;
    }

    const destDir = path.resolve(BASE_DEST_DIR);
    const baseRepoDir = path.resolve(
        CWD,
        `./output/git/${repoType}`,
        PROVIDER_REPOS[repoType].commit,
    );

    await fsExtra.ensureDir(baseRepoDir);

    for (const folderAsDomainEntry of folderAsDomainEntries) {
        const resolvedDistDir = path.resolve(destDir, folderAsDomainEntry.folderNameAsDomain, destSubFolder ?? "");
        LOG(
            LOG_LEVELS.title(`Preparing built-in WebClient build [${repoType}]:`),
            LOG_LEVELS.value(JSON.stringify({...folderAsDomainEntry, resolvedDistDir})),
        );

        if (await fsExtra.pathExists(path.join(resolvedDistDir, "index.html"))) {
            LOG(LOG_LEVELS.warning(`Skipping as directory already exists:`), LOG_LEVELS.value(resolvedDistDir));
            continue;
        }

        const repoDir = path.resolve(baseRepoDir, folderAsDomainEntry.folderNameAsDomain);
        const distDir = path.resolve(repoDir, repoRelativeDistDir);
        const flowArg = {repoDir, folderAsDomainEntry};
        const blankHtmlFile = path.join(distDir, WEB_CLIENTS_BLANK_HTML_FILE_NAME);

        if (await fsExtra.pathExists(repoDir)) {
            LOG(LOG_LEVELS.warning(`Skipping cloning`));
        } else {
            await fsExtra.ensureDir(repoDir);
            await clone(repoType, repoDir);
        }

        if (await fsExtra.pathExists(path.join(distDir, "index.html"))) {
            LOG(LOG_LEVELS.warning(`Skipping building`));
        } else {
            if (await fsExtra.pathExists(path.resolve(repoDir, "node_modules"))) {
                LOG(LOG_LEVELS.warning(`Skipping dependencies installing`));
            } else {
                if (preInstall) {
                    await preInstall(flowArg);
                }
                if (install) {
                    await install(flowArg);
                } else {
                    await execShell([
                        "npm",
                        ["ci"],
                        {cwd: repoDir, env: {...process.env, ...PROVIDER_REPOS[repoType].i18nEnvVars}},
                    ]);
                }
            }

            await build(flowArg);
        }

        if (await fsExtra.pathExists(blankHtmlFile)) {
            LOG(LOG_LEVELS.warning(`Skipping creating ${LOG_LEVELS.value(blankHtmlFile)}`));
        } else {
            printAndWriteFile(
                blankHtmlFile,
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
        }

        LOG(LOG_LEVELS.title(`Copying: ${LOG_LEVELS.value(distDir)} to ${LOG_LEVELS.value(resolvedDistDir)}`));
        await fsExtra.copy(distDir, resolvedDistDir);
    }
}
