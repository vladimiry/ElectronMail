import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {CONSOLE_LOG, applyPatch, execShell, resolveGitOutputBackupDir} from "scripts/lib";
import {CWD_ABSOLUTE_DIR, GIT_CLONE_ABSOLUTE_DIR} from "scripts/const";
import {PROVIDER_APP_NAMES, PROVIDER_REPO_MAP} from "src/shared/proton-apps-constants";
import {RUNTIME_ENV_CI_PROTON_CLIENTS_ONLY, WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/constants";

const folderAsDomainEntries = [
    {
        folderNameAsDomain: "app.protonmail.ch",
        options: {
            configApiParam: "electron-mail:app.protonmail.ch",
        },
    },
    {
        folderNameAsDomain: "mail.protonmail.com",
        options: {
            configApiParam: "electron-mail:mail.protonmail.com",
        },
    },
    {
        folderNameAsDomain: "protonmailrmez3lotccipshtkleegetolb73fuirgj7r4o4vfu7ozyd.onion",
        options: {
            configApiParam: "electron-mail:protonmailrmez3lotccipshtkleegetolb73fuirgj7r4o4vfu7ozyd.onion",
        },
    },
] as const;

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

async function configure(
    {cwd, envFileName = "./appConfig.json", repoType}: { cwd: string; envFileName?: string; repoType: keyof typeof PROVIDER_REPO_MAP },
    {folderNameAsDomain, options}: typeof folderAsDomainEntries[number],
): Promise<{ configApiParam: string }> {
    const {configApiParam} = options;

    writeFile(
        path.join(cwd, envFileName),
        JSON.stringify({
            appConfig: PROVIDER_REPO_MAP[repoType].protonPack.appConfig,
            [configApiParam]: {
                // https://github.com/ProtonMail/WebClient/issues/166#issuecomment-561060855
                api: `https://${folderNameAsDomain}/api`,
                secure: "https://secure.protonmail.com",
            },
            // so "dsn: SENTRY_CONFIG[env].sentry" code line not throwing ("env" variable gets resolved with "dev" value)
            // https://github.com/ProtonMail/WebClient/blob/aebd13605eec849bab199ffc0e58407a2e0d6537/env/config.js#L146
            dev: {},
        }, null, 2),
    );

    return {configApiParam};
}

function resolveWebpackConfigPatchingCode(
    {
        webpackConfigVarName,
        webpackIndexEntryItems,
    }: {
        webpackConfigVarName: string
        webpackIndexEntryItems?: unknown
    },
): string {
    const disableMangling = Boolean(webpackIndexEntryItems);
    const result = `
        ${webpackConfigVarName}.devtool = false;

        Object.assign(
            ${webpackConfigVarName}.optimization,
            {
                minimize: ${!disableMangling /* eslint-disable-line @typescript-eslint/restrict-template-expressions */},
                moduleIds: "named",

                // allows resolving individual modules from "window.webpackJsonp"
                concatenateModules: ${!disableMangling /* eslint-disable-line @typescript-eslint/restrict-template-expressions */},

                // allows preserving in the bundle some constants we reference in the provider api code
                // TODO proton v4: figure how to apply "usedExports: false" to specific files only
                usedExports: ${!disableMangling /* eslint-disable-line @typescript-eslint/restrict-template-expressions */},
            },
        );

        Object.assign(
            ${webpackConfigVarName}.optimization,
            {
                chunkIds: "named",
                ${disableMangling ? "mangleExports: false," : ""}
            },
        );

        ${disableMangling
        ? `webpackConfig.output.chunkLoadingGlobal = "webpackJsonp";`
        : ""}

        ${disableMangling
        ? `
            const terserPluginInstance = ${webpackConfigVarName}.optimization.minimizer
                .find((plugin) => plugin.constructor.name === "TerserPlugin");
            if (!terserPluginInstance) {
                throw new Error("TerserPlugin instance resolving failed");
            }
            // terserPluginInstance.options.minify = false;
            terserPluginInstance.options.parallel = false;
            Object.assign(
                terserPluginInstance.options.terserOptions,
                {
                    // proton v4: needed to preserve original function names
                    //            just "{keep_fnames: true, mangle: false}" is not sufficient
                    ...({keep_fnames: true, compress: false}),
                },
            );
        `
        : `delete ${webpackConfigVarName}.optimization.minimizer;`}

        ${webpackIndexEntryItems
        ? `{
            const items = ${JSON.stringify(webpackIndexEntryItems, null, 2)};
            ${webpackConfigVarName}.entry.index.unshift(...items);
        }`
        : ""}

        for (const rule of ${webpackConfigVarName}.module.rules) {
            const babelLoaderOptions = (
                typeof rule === "object"
                &&
                Array.isArray(rule.use)
                &&
                (rule.use.find((item) => item.loader === "babel-loader") || {}).options
            );
            if (babelLoaderOptions) {
                babelLoaderOptions.compact = false;
            }
        }

        ${webpackConfigVarName}.plugins = ${webpackConfigVarName}.plugins.filter((plugin) => {
            switch (plugin.constructor.name) {
                case "HtmlWebpackPlugin":
                    plugin.userOptions.minify = false;
                    break;
                case "ImageminPlugin":
                    return false;
                case "FaviconsWebpackPlugin":
                    return false;
                case "OptimizeCSSAssetsPlugin":
                    return false;
                case "OptimizeCssAssetsWebpackPlugin":
                    return false;
                case "SourceMapDevToolPlugin":
                    return false;
                case "HashedModuleIdsPlugin":
                    return false;
            }
            return true;
        });
    `;

    return result;
}

function writeFile(file: string, content: Buffer | string): void {
    CONSOLE_LOG(`Writing ${file} file with content...`);
    fsExtra.ensureDirSync(path.dirname(file));
    fs.writeFileSync(file, content);
}

async function cleanDestAndMoveToIt({src, dest}: { src: string, dest: string }): Promise<void> {
    CONSOLE_LOG(`Moving ${src} to ${dest} (cleaning destination dir before)`);
    await execShell(["npx", ["--no", "rimraf", dest]]);
    await fsExtra.move(src, dest);
}

async function executeBuildFlow(
    {
        repoType,
        repoRelativeDistDir = PROVIDER_REPO_MAP[repoType].repoRelativeDistDir,
        destDir,
        destSubFolder,
    }: {
        repoType: keyof typeof PROVIDER_REPO_MAP
        repoRelativeDistDir?: string
        destDir: string
        destSubFolder: string
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

    const repoDir = path.join(GIT_CLONE_ABSOLUTE_DIR, "./WebClients");
    const appDir = path.join(repoDir, "./applications", repoType.substr("proton-".length));
    const repoDistDir = path.join(appDir, repoRelativeDistDir);
    const {tag} = PROVIDER_REPO_MAP[repoType];

    const state: { buildingSetup: () => Promise<void> } = {
        async buildingSetup() {
            state.buildingSetup = async () => Promise.resolve(); // one run per "repo type" only needed

            // TODO move block to "folderAsDomainEntry" loop if "node_modules" gets patched
            if (fsExtra.pathExistsSync(path.join(repoDir, ".git"))) {
                await execShell(["git", ["reset", "--hard", "origin/main"], {cwd: repoDir}]);
                await execShell(["git", ["clean", "-fdx"], {cwd: repoDir}]);
                if (
                    !(await execShell(["git", ["tag"], {cwd: repoDir}], {printStdOut: false})).stdout.trim().includes(tag)
                ) {
                    await execShell(["git", ["fetch", "--all", "--tags"], {cwd: repoDir}]);
                }
            } else { // cloning
                await execShell(["npx", ["--no", "rimraf", repoDir]]);
                fsExtra.ensureDirSync(repoDir);
                await execShell(["git", ["clone", "https://github.com/ProtonMail/WebClients.git", repoDir]]);
                await execShell(["git", ["show", "--summary"], {cwd: repoDir}]);
            }

            await execShell(["git", ["reset", "--hard", tag], {cwd: repoDir}]);

            {
                // TODO drop "postinstall" script wiping logic when all referenced https://github.com/ProtonMail/WebClients/tags get updated
                //      see https://github.com/ProtonMail/WebClients/issues/254 for details
                const scriptCriteria = {key: "postinstall", value: "is-ci || (husky install; yarn run config-app)"} as const;
                const packageJSONFileLocation = path.join(repoDir, "./package.json");
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const packageJSON: { scripts: Record<string, string> } = JSON.parse(fs.readFileSync(packageJSONFileLocation).toString());

                if (
                    Object
                        .entries(packageJSON.scripts)
                        .some(([key, value]) => key === scriptCriteria.key && value === scriptCriteria.value)
                ) {
                    CONSOLE_LOG(`Dropping "${scriptCriteria.key}" script from the ${packageJSONFileLocation} file...`);
                    delete packageJSON.scripts[scriptCriteria.key];
                    fs.writeFileSync(packageJSONFileLocation, JSON.stringify(packageJSON, null, 2));
                }
            }

            if (process.env.CI) { // TODO drop "yarn install" hacks when executing on CI env
                // hacks applied to avoid the following error:
                //     eslint-disable-next-line max-len
                //     YN0018: │ sieve.js@https://github.com/ProtonMail/sieve.js.git#commit=a09ab52092164af74278e77612a091e730e9b7e9: The remote archive doesn't match the expected checksum
                // see https://github.com/yarnpkg/berry/issues/1142 and https://github.com/yarnpkg/berry/issues/1989 for details
                await execShell(["yarn", ["cache", "clean", "--all"], {cwd: repoDir}]);
                await execShell([
                    "yarn", ["install"],
                    {
                        cwd: repoDir,
                        env: {
                            ...process.env,
                            PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "1",
                            YARN_CHECKSUM_BEHAVIOR: "update",
                            YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
                        },
                    },
                ]);
            } else {
                await execShell(["yarn", ["install"], {cwd: repoDir}], {printStdOut: false});
            }

            for (const patchFileName of (await import("patches/protonmail/meta.json")).default[repoType]) {
                await applyPatch({
                    patchFile: path.join(CWD_ABSOLUTE_DIR, "./patches/protonmail", patchFileName),
                    cwd: repoDir,
                });
            }
        },
    };

    for (const folderAsDomainEntry of folderAsDomainEntries) {
        const targetDistDir = path.resolve(destDir, folderAsDomainEntry.folderNameAsDomain, destSubFolder);

        CONSOLE_LOG(
            `Prepare web client build [${repoType}]:`,
            JSON.stringify({...folderAsDomainEntry, resolvedDistDir: targetDistDir}),
        );

        if (fsExtra.pathExistsSync(path.join(targetDistDir, WEB_CLIENTS_BLANK_HTML_FILE_NAME))) {
            CONSOLE_LOG("Skip building as bundle already exists:", targetDistDir);
            continue;
        }

        const repoDistBackupDir = resolveGitOutputBackupDir({repoType, suffix: `dist-${folderAsDomainEntry.folderNameAsDomain}`});

        if (fsExtra.pathExistsSync(repoDistBackupDir)) { // taking "dist" from the backup
            await execShell(["npx", ["--no", "rimraf", repoDistDir]]);
            const src = repoDistBackupDir;
            const dest = repoDistDir;
            CONSOLE_LOG(`Copying backup ${src} to ${dest}`);
            await fsExtra.copy(src, dest);
        } else { // building
            if (shouldFailOnBuild) {
                throw new Error(`Halting since "${shouldFailOnBuildEnvVarName}" env var has been enabled`);
            } else { // building
                await state.buildingSetup();

                const {configApiParam} = await configure({cwd: appDir, repoType}, folderAsDomainEntry);
                const publicPath: string | undefined = repoType !== "proton-mail"
                    ? `/${PROVIDER_REPO_MAP[repoType].baseDirName}/`
                    : undefined;

                if (repoType === "proton-mail" || repoType === "proton-calendar") {
                    const webpackIndexEntryItems = repoType === "proton-mail" || repoType === "proton-calendar"
                        ? PROVIDER_REPO_MAP[repoType].protonPack.webpackIndexEntryItems
                        : undefined;

                    // https://github.com/ProtonMail/proton-pack/tree/2e44d5fd9d2df39787202fc08a90757ea47fe480#how-to-configure
                    writeFile(
                        path.join(appDir, "./proton.config.js"),
                        `
                        module.exports = (webpackConfig) => {
                        ${
                            resolveWebpackConfigPatchingCode({
                                webpackConfigVarName: "webpackConfig",
                                webpackIndexEntryItems,
                            })
                        }
                        return webpackConfig;
                        }`,
                    );
                }

                await execShell(["npx", ["--no", "rimraf", repoDistDir]]);

                await execShell(
                    [
                        "yarn",
                        [
                            "workspace",
                            repoType,
                            "run",
                            "proton-pack",
                            "build",
                            `--api=${configApiParam}`,
                            `--appMode=bundle`, // standalone | sso | bundle
                            ...(publicPath ? [`--publicPath=${publicPath}`] : []),
                            // eslint-disable-next-line
                            // https://github.com/ProtonMail/WebClients/blob/8d7f8a902034405988bd70431c714e9fdbb37a1d/packages/pack/bin/protonPack#L38
                            // `--appMode=bundle`,
                        ],
                        {
                            cwd: repoDir,
                            env: {
                                ...process.env,
                                ...(publicPath && {PUBLIC_PATH: publicPath}),
                                NODE_ENV: "production",
                            },
                        },
                    ],
                    publicPath ? {printEnvWhitelist: ["PUBLIC_PATH"]} : undefined,
                );
            }

            writeFile(
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
                await execShell(["npx", ["--no", "rimraf", dest]]);
                CONSOLE_LOG(`Backup ${src} to ${dest}`);
                await fsExtra.copy(src, dest);
            }
        }

        // move to destination folder
        await cleanDestAndMoveToIt({src: repoDistDir, dest: targetDistDir});
    }
}

export const buildProtonClients = async ({destDir}: { destDir: string }): Promise<void> => {
    for (const repoType of PROVIDER_APP_NAMES) {
        await executeBuildFlow({
            repoType,
            destDir,
            destSubFolder: PROVIDER_REPO_MAP[repoType].baseDirName,
        });
    }
};
