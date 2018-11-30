import byline from "byline";
import chalk from "chalk";
import fsExtra from "fs-extra";
import path from "path";
import spawnAsync from "@expo/spawn-async";
import {GitProcess} from "dugite";

import {Arguments} from "src/shared/types";
import {PROVIDER_REPO} from "src/shared/constants";

// tslint:disable-next-line:no-console
const log = console.log;
const distDir = process.argv[2];
const repoDir = path.resolve(process.cwd(), "./output/git/protonmail/webclient");
const repoDistDir = path.resolve(repoDir, "./dist");
const foldersAsDomains = [
    "mail.protonmail.com",
];

(async () => {
    for (const folder of foldersAsDomains) {
        const resolvedDistDir = path.resolve(distDir, folder);
        log(chalk.blue(`Preparing "${resolvedDistDir}" build`));

        if (await fsExtra.pathExists(repoDir)) {
            log(chalk.yellow(`Skipping cloning`));
        } else {
            await fsExtra.ensureDir(repoDir);
            await clone(repoDir);
        }

        if (await fsExtra.pathExists(path.resolve(repoDir, "node_modules"))) {
            log(chalk.yellow(`Skipping dependencies installing`));
        } else {
            await installDependencies(repoDir);
        }

        if (await fsExtra.pathExists(repoDistDir)) {
            log(chalk.yellow(`Skipping building`));
        } else {
            await build(repoDir);
        }

        await fsExtra.copy(repoDistDir, resolvedDistDir);
    }
})().catch((error) => {
    log(chalk.red(error));
    throw error;
});

async function build(dir: string) {
    await _exec(["npm", ["run", "config"], {cwd: dir}]);
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
                byline(stderr).on("data", (chunk) => log(chunk.toString()));
            },
            ...options,
        },
    ];
    log(chalk.blue(`Executing "${JSON.stringify(args)}" Git command`));
    const result = await GitProcess.exec(...args);

    if (result.exitCode) {
        throw new Error(String(result.stderr).trim());
    }
}

async function _exec(args: Arguments<typeof spawnAsync>) {
    log(chalk.blue(`Executing "${JSON.stringify(args)}" Shell command`));

    const command = spawnAsync(...args);
    byline(command.child.stdout).on("data", (chunk) => log(chunk.toString()));
    const {status: exitCode} = await command;

    if (exitCode) {
        throw new Error(`Failed to execute "${JSON.stringify(args)}" command`);
    }
}
