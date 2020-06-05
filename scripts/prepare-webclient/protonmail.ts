import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import {promisify} from "util";

import {CWD, LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {FolderAsDomainEntry, execAccountTypeFlow, printAndWriteFile} from "./lib";
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

async function configure(
    {cwd, envFileName = "./appConfig.json", repoType}: { cwd: string; envFileName?: string; repoType: keyof typeof PROVIDER_REPOS },
    {folderNameAsDomain, options}: Unpacked<typeof folderAsDomainEntries>,
): Promise<{ configApiParam: string }> {
    const {configApiParam} = options;

    printAndWriteFile(
        path.join(cwd, envFileName),
        JSON.stringify({
            appConfig: PROVIDER_REPOS[repoType].protonPackAppConfig,
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

// https://github.com/ProtonMail/proton-pack/tree/2e44d5fd9d2df39787202fc08a90757ea47fe480#how-to-configure
async function writeProtonConfigFile(
    {cwd}: { cwd: string },
): Promise<void> {
    printAndWriteFile(
        path.join(cwd, "./proton.config.js"),
        `
            module.exports = (webpackConfig) => {
                ${resolveWebpackConfigPatchingCode("webpackConfig")}
                return webpackConfig;
            }
        `,
    );
}

(async () => {
    // TODO move "WebClient" build logic to separate file (got long)
    await (async () => {
        const repoType = "WebClient";

        await execAccountTypeFlow({
            repoType,
            folderAsDomainEntries,
            flows: {
                async postClone({repoDir}) {
                    await execShell([
                        "git",
                        [
                            "apply",
                            "--ignore-whitespace",
                            "--reject",
                            path.join(
                                CWD,
                                "./patches/protonmail/webclient/src/app/core/controllers/secured.js.patch",
                            ),
                        ],
                        {cwd: repoDir},
                    ]);
                },

                async build({repoDir, folderAsDomainEntry}) {
                    const {configApiParam} = await configure(
                        // TODO proton-v4: drop "envFileName" parameter when proton moves "WebClient" to "proton-pack" building
                        {cwd: repoDir, envFileName: "./env/env.json", repoType},
                        folderAsDomainEntry,
                    );

                    // TODO proton-v4: drop "npm run config" call when proton moves "WebClient" to "proton-pack" building
                    await execShell(["npm", ["run", "config", "--", "--api", configApiParam], {cwd: repoDir}]);

                    await (async () => {
                        const originalWebpackConfigFile = path.join(repoDir, "./webpack.config.original.js");
                        const webpackConfigFile = path.join(repoDir, "./webpack.config.js");

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

                        printAndWriteFile(
                            webpackConfigFile,
                            `
                                const webpackConfig = require("${originalWebpackConfigFile}");
                                ${resolveWebpackConfigPatchingCode("webpackConfig")}
                                module.exports = webpackConfig;
                            `,
                        );

                        await execShell(["npm", ["run", "build", "--", "--api", configApiParam], {cwd: repoDir}]);
                    })();
                },
            },
        });
    })();

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
