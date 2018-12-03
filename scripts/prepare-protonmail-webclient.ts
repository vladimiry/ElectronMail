import byline from "byline";
import chalk from "chalk";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import spawnAsync from "@expo/spawn-async";
import {GitProcess} from "dugite";
import {promisify} from "util";

import {Arguments} from "src/shared/types";
import {PROVIDER_REPO} from "src/shared/constants";

type ApiParam =
    | "email-securely-app:mail.protonmail.com"
    | "email-securely-app:protonirockerxow.onion";

interface FolderAsDomainEntry {
    configApiParam: ApiParam;
    folderNameAsDomain: string;
}

// tslint:disable-next-line:no-console
const consoleLog = console.log;
// tslint:disable-next-line:no-console
const consoleError = console.error;
const chalkConsoleValue = (value: string) => chalk.cyan(value);

const distDir = process.argv[2];
const baseRepoDir = path.resolve(process.cwd(), `./output/git/protonmail/webclient/${PROVIDER_REPO.protonmail.commit}`);

const folderAsDomainEntries: FolderAsDomainEntry[] = [
    {
        configApiParam: "email-securely-app:mail.protonmail.com",
        folderNameAsDomain: "mail.protonmail.com",
    },
    {
        configApiParam: "email-securely-app:protonirockerxow.onion",
        folderNameAsDomain: "protonirockerxow.onion",
    },
];

(async () => {
    for (const folderAsDomainEntry of folderAsDomainEntries) {
        const resolvedDistDir = path.resolve(distDir, folderAsDomainEntry.folderNameAsDomain);
        consoleLog(
            chalk.magenta(`Preparing built-in WebClient build:`),
            chalkConsoleValue(JSON.stringify({...folderAsDomainEntry, resolvedDistDir})),
        );

        if (await fsExtra.pathExists(resolvedDistDir)) {
            consoleLog(chalk.yellow(`Skipping as directory already exists:`), chalkConsoleValue(resolvedDistDir));
            continue;
        }

        const repoDir = path.resolve(baseRepoDir, folderAsDomainEntry.folderNameAsDomain);
        const repoDistDir = path.resolve(repoDir, "./dist");

        if (await fsExtra.pathExists(repoDir)) {
            consoleLog(chalk.yellow(`Skipping cloning`));
        } else {
            await fsExtra.ensureDir(repoDir);
            await clone(repoDir);
        }

        if (await fsExtra.pathExists(path.resolve(repoDir, "node_modules"))) {
            consoleLog(chalk.yellow(`Skipping dependencies installing`));
        } else {
            await installDependencies(repoDir);
        }

        if (await fsExtra.pathExists(repoDistDir)) {
            consoleLog(chalk.yellow(`Skipping building`));
        } else {
            await build({dir: repoDir, ...folderAsDomainEntry});
        }

        consoleLog(chalk.magenta(`Copying:`), chalkConsoleValue(`${repoDistDir}" to "${resolvedDistDir}`));
        await fsExtra.copy(repoDistDir, resolvedDistDir);
    }
})().catch((error) => {
    consoleError("Uncaught exception", error);
    process.exit(1);
});

async function build({dir, configApiParam, folderNameAsDomain}: { dir: string; } & FolderAsDomainEntry) {
    const file = path.join(dir, "./env/env.json");
    const data = JSON.stringify({
        [configApiParam]: {
            api: `https://${folderNameAsDomain}/api`,
            sentry: {},
        },
    });

    consoleLog(chalk.magenta(`Writing file: `), chalkConsoleValue(JSON.stringify({file, data})));
    await promisify(fs.writeFile)(file, data);

    await _exec(["npm", ["run", "config", "--", `--api`, configApiParam, `--debug`, "true"], {cwd: dir}]);
    await _exec(["npm", ["run", "dist"], {cwd: dir}]);
}

async function installDependencies(dir: string) {
    await _exec(["npm", ["install"], {cwd: dir}]);
}

async function clone(destDir: string) {
    const {repo, commit} = PROVIDER_REPO.protonmail;

    await _execGit([
        ["clone", "--progress", repo, "."],
        destDir,
    ]);
    await _execGit([
        ["checkout", commit],
        destDir,
    ]);
    // TODO call "_execGit" instead of "_exec"
    await _exec(["git", ["show", "--summary"], {cwd: destDir}]);
}

async function _execGit([commands, pathArg, options]: Arguments<typeof GitProcess.exec>) {
    const args: Arguments<typeof GitProcess.exec> = [
        commands,
        pathArg,
        {
            processCallback: ({stderr}) => {
                byline(stderr).on("data", (chunk) => consoleLog(formatChunk(chunk)));
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

async function _exec(args: Arguments<typeof spawnAsync>) {
    consoleLog(chalk.magenta(`Executing Shell command:`), chalkConsoleValue(JSON.stringify(args)));

    const taskPromise = spawnAsync(...args);

    byline(taskPromise.child.stdout).on("data", (chunk) => consoleLog(formatChunk(chunk)));
    byline(taskPromise.child.stderr).on("data", (chunk) => consoleError(formatChunk(chunk)));
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

function formatChunk(chunk: any): string {
    return Buffer.from(chunk, "UTF-8").toString();
}
