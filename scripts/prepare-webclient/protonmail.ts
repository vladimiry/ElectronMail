import UUID from "pure-uuid";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import {promisify} from "util";

import {FolderAsDomainEntry, execAccountTypeFlow} from "./lib";
import {LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {PROVIDER_REPOS} from "src/shared/constants";

const folderAsDomainEntries: Array<FolderAsDomainEntry<{
    configApiParam:
        | "electron-mail:app.protonmail.ch"
        | "electron-mail:mail.protonmail.com"
        | "electron-mail:protonirockerxow.onion";
}>> = [
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
        folderNameAsDomain: "protonirockerxow.onion",
        options: {
            configApiParam: "electron-mail:protonirockerxow.onion",
        },
    },
];

(async () => {
    // TODO move "WebClient" build logic to separate file (got long)
    await execAccountTypeFlow({
        repoType: "WebClient",
        folderAsDomainEntries,
        flows: {
            build: async ({repoDir: cwd, folderAsDomainEntry}) => {
                const {configApiParam} = await configure(
                    // TODO proton-v4: drop "envFileName" parameter when proton moves "WebClient" to "proton-pack" building
                    {cwd, envFileName: "./env/env.json", repoType: "WebClient"},
                    folderAsDomainEntry,
                );

                // TODO proton-v4: drop "npm run config" call when proton moves "WebClient" to "proton-pack" building
                await execShell(["npm", ["run", "config", "--", "--api", configApiParam], {cwd}]);

                await (async () => {
                    const originalWebpackConfigFile = path.join(cwd, "./webpack.config.original.js");
                    const webpackConfigFile = path.join(cwd, "./webpack.config.js");

                    await (async (from = webpackConfigFile, to = originalWebpackConfigFile) => {
                        if (await fsExtra.pathExists(to)) {
                            LOG(
                                LOG_LEVELS.warning(`Skipping renaming ${LOG_LEVELS.value(from)} to: ${LOG_LEVELS.value(to)}`),
                            );
                            return;
                        }
                        LOG(
                            LOG_LEVELS.title(`Renaming ${LOG_LEVELS.value(from)} to: ${LOG_LEVELS.value(to)}`),
                        );
                        await promisify(fs.rename)(from, to);
                    })();

                    const hasSeenOboardingModalSuppressor = await (async () => {
                        const replacedMarkFile = path.join(cwd, `${new UUID(4).format()}-replaced-mark`);
                        const targetFile = path.resolve(cwd, "./src/app/core/controllers/secured.js");
                        if (!fsExtra.existsSync(targetFile)) {
                            throw new Error(`File "${targetFile}" doesn't exist`);
                        }
                        await execShell(["npm", ["add", "--no-save", "string-replace-loader"], {cwd}]);
                        // tslint:disable-next-line
                        // https://github.com/ProtonMail/WebClient/blob/0c504c8d4ae84a665af5b6e2603228f414ac6f07/src/app/core/controllers/secured.js#L84
                        const search = "return $cookies.get(ONBOARD_MODAL_COOKIE) || localStorage.getItem(ONBOARD_MODAL_COOKIE);";
                        const replace = "return true;";
                        return {
                            targetFile,
                            isReplaced: () => fsExtra.existsSync(replacedMarkFile),
                            webpackConfigCodePatch: `
                                webpackConfig.module.rules.push({
                                    test: ${JSON.stringify(targetFile)},
                                    loader: 'string-replace-loader',
                                    options: {
                                      search: ${JSON.stringify(search)},
                                      replace: () => {
                                        const result = ${JSON.stringify(replace)};
                                        require("fs").writeFileSync(${JSON.stringify(replacedMarkFile)}, "");
                                        return result;
                                      },
                                      strict: true,
                                    }
                                })
                            `,
                        } as const;
                    })();

                    const webpackConfigFileContent = `
                        const webpackConfig = require("${originalWebpackConfigFile}");
                        ${resolveWebpackConfigPatchingCode("webpackConfig")}
                        ${hasSeenOboardingModalSuppressor.webpackConfigCodePatch}
                        module.exports = webpackConfig;
                    `;

                    LOG(
                        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(webpackConfigFile)} file with content:`),
                        LOG_LEVELS.value(webpackConfigFileContent),
                    );
                    await promisify(fs.writeFile)(webpackConfigFile, webpackConfigFileContent);

                    await execShell(["npm", ["run", "build", "--", "--api", configApiParam], {cwd}]);

                    if (!hasSeenOboardingModalSuppressor.isReplaced()) {
                        throw new Error(`Failed to patch the "${hasSeenOboardingModalSuppressor}" file`);
                    }
                })();
            },
        },
    });

    for (const repoType of (["proton-mail-settings", "proton-contacts", "proton-calendar"] as const)) {
        const destSubFolder = PROVIDER_REPOS[repoType].baseDir;

        if (!destSubFolder) {
            throw new Error(
                `Failed to resolve "destSubFolder" variable, resolved value: "${destSubFolder}" (${JSON.stringify({repoType})})`,
            );
        }

        await execAccountTypeFlow({
            repoType,
            folderAsDomainEntries,
            destSubFolder,
            flows: {
                // TODO proton-v4: remove "npm install" code block
                // https://github.com/ProtonMail/WebClient/issues/158
                install: repoType === "proton-contacts" || repoType === "proton-calendar"
                    ? async ({repoDir}) => {
                        const npmLockFile = path.join(repoDir, "./package-lock.json");

                        if (fsExtra.existsSync(npmLockFile)) {
                            throw new Error(`"${npmLockFile}" file exists, it's time for switching to "npm ci" call`);
                        }

                        await execShell(["yarn", ["install"], {cwd: repoDir}]);
                    }
                    : undefined,
                build: async ({repoDir: cwd, folderAsDomainEntry}) => {
                    const {configApiParam} = await configure({cwd, repoType}, folderAsDomainEntry);
                    await writeProtonConfigFile({cwd});
                    await execShell(["npm", ["run", "build", "--", "--api", configApiParam], {cwd}]);
                },
            },
        });
    }
})().catch((error) => {
    LOG(error);
    process.exit(1);
});

async function configure(
    {cwd, envFileName = "./appConfig.json", repoType}: { cwd: string; envFileName?: string; repoType: keyof typeof PROVIDER_REPOS; },
    {folderNameAsDomain, options}: FolderAsDomainEntry,
): Promise<{ configApiParam: string }> {
    const {configApiParam} = options;
    const envFile = path.join(cwd, envFileName);
    const envFileContent = JSON.stringify({
        appConfig: PROVIDER_REPOS[repoType].protonPackAppConfig,
        [configApiParam]: {
            // https://github.com/ProtonMail/WebClient/issues/166#issuecomment-561060855
            api: `https://${folderNameAsDomain}/api`,
            secure: "https://secure.protonmail.com",
        },
    }, null, 2);

    LOG(
        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(envFile)} file with content:`),
        LOG_LEVELS.value(envFileContent),
    );
    await promisify(fs.writeFile)(envFile, envFileContent);

    return {configApiParam};
}

// https://github.com/ProtonMail/proton-pack/tree/2e44d5fd9d2df39787202fc08a90757ea47fe480#how-to-configure
async function writeProtonConfigFile(
    {cwd}: { cwd: string; },
): Promise<void> {
    const file = path.join(cwd, "./proton.config.js");
    const fileContent = `
        module.exports = (webpackConfig) => {
            ${resolveWebpackConfigPatchingCode("webpackConfig")}
            return webpackConfig;
        }
    `;

    LOG(
        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(file)} file with content:`),
        LOG_LEVELS.value(fileContent),
    );

    await promisify(fs.writeFile)(file, fileContent);
}

function resolveWebpackConfigPatchingCode(webpackConfigVarName = "webpackConfig"): string {
    const result = `
        const {CI} = process.env;

        ${webpackConfigVarName}.devtool = false;

        Object.assign(
            ${webpackConfigVarName}.optimization,
            {
                moduleIds: "named",
                namedChunks: true,
                namedModules: true,
                minimize: false,
            },
        );

        ${webpackConfigVarName}.plugins = ${webpackConfigVarName}.plugins.filter((plugin) => {
            switch (plugin.constructor.name) {
                case "HtmlWebpackPlugin":
                    plugin.options.minify = false;
                    break;
                case "ImageminPlugin":
                    if (CI) {
                        plugin.options.maxConcurrency = 1;
                        break;
                    }
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
