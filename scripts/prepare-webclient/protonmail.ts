import fsExtra from "fs-extra";
import path from "path";

import {BINARY_NAME} from "src/shared/constants";
import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {FolderAsDomainEntry, executeBuildFlow, printAndWriteFile} from "./lib";
import {PROVIDER_REPO_MAP, PROVIDER_REPO_NAMES} from "src/shared/proton-apps-constants";
import {applyPatch, execShell} from "scripts/lib";

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
    {cwd, envFileName = "./appConfig.json", repoType}: { cwd: string; envFileName?: string; repoType: keyof typeof PROVIDER_REPO_MAP },
    {folderNameAsDomain, options}: Unpacked<typeof folderAsDomainEntries>,
): Promise<{ configApiParam: string }> {
    const {configApiParam} = options;

    printAndWriteFile(
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
        webpackIndexEntryItems
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
                namedChunks: true,
                namedModules: true,

                // allows resolving individual modules from "window.webpackJsonp"
                concatenateModules: ${!disableMangling /* eslint-disable-line @typescript-eslint/restrict-template-expressions */},

                // allows resolving individual modules by path-based names (from "window.webpackJsonp")
                namedModules: ${disableMangling /* eslint-disable-line @typescript-eslint/restrict-template-expressions */},

                // allows preserving in the bundle some constants we reference in the provider api code
                // TODO proton v4: figure how to apply "usedExports: false" to specific files only
                usedExports: ${!disableMangling /* eslint-disable-line @typescript-eslint/restrict-template-expressions */},

                // TODO proton v4: switch to to "mangleExports" optimization option recently introduced in webpack v5
                // mangleExports: false,
            },
        );

        ${disableMangling
        ? `{
            const items = ${JSON.stringify(webpackIndexEntryItems, null, 2)}.map((item) => item.substr(1)); // turn "./" => "/"
            Object.assign(
                (${webpackConfigVarName}.optimization.splitChunks.cacheGroups
                    = ${webpackConfigVarName}.optimization.splitChunks.cacheGroups || {}),
                {
                    ${JSON.stringify(BINARY_NAME)}: {
                        test(module) {
                            const resource = module && module.resource
                            return resource && items.some((item) => resource.endsWith(item))
                        },
                        enforce: true,
                        minSize: 0,
                        name: "${BINARY_NAME}-chunk",
                    },
                },
            );
        }` : ""}

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
            ${webpackConfigVarName}.entry.index.push(...items);
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

export const buildProtonClients = async ({destDir}: { destDir: string }): Promise<void> => {
    for (const repoType of PROVIDER_REPO_NAMES) {
        await executeBuildFlow({
            repoType,
            folderAsDomainEntries,
            destDir,
            destSubFolder: PROVIDER_REPO_MAP[repoType].baseDirName,
            flow: {
                async install({repoDir}) {
                    await execShell(["npm", ["ci"], {cwd: repoDir}]);

                    {
                        const resolvePatchFile = (file: string): string => path.join(CWD_ABSOLUTE_DIR, `./patches/protonmail/${file}`);
                        const repoTypePatchFile = resolvePatchFile(`${repoType}.patch`);

                        await applyPatch({
                            patchFile: resolvePatchFile(
                                repoType === "proton-drive"
                                    ? "common-drive.patch"
                                    : "common-except-drive.patch",
                            ),
                            cwd: repoDir,
                        });

                        if (fsExtra.pathExistsSync(repoTypePatchFile)) {
                            await applyPatch({patchFile: repoTypePatchFile, cwd: repoDir});
                        }
                    }
                },

                build: async ({repoDir: cwd, folderAsDomainEntry}) => {
                    const {configApiParam} = await configure({cwd, repoType}, folderAsDomainEntry);
                    const {publicPath} = await (async () => {
                        const webpackPatch = repoType !== "proton-mail"
                            ? {publicPath: `/${PROVIDER_REPO_MAP[repoType].baseDirName}/`}
                            : undefined;
                        const webpackIndexEntryItems = repoType === "proton-mail" || repoType === "proton-calendar"
                            ? PROVIDER_REPO_MAP[repoType].protonPack.webpackIndexEntryItems
                            : undefined;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        const packageJson: { config?: { publicPathFlag?: unknown } } = await import(path.join(cwd, "./package.json"));

                        // https://github.com/ProtonMail/proton-pack/tree/2e44d5fd9d2df39787202fc08a90757ea47fe480#how-to-configure
                        printAndWriteFile(
                            path.join(cwd, "./proton.config.js"),
                            `
                            module.exports = (webpackConfig) => {
                                ${
                                resolveWebpackConfigPatchingCode({
                                    webpackConfigVarName: "webpackConfig",
                                    webpackIndexEntryItems,
                                })}
                                ${
                                webpackPatch?.publicPath
                                    ? "webpackConfig.output.publicPath = " + JSON.stringify(webpackPatch?.publicPath)
                                    : ""}
                                return webpackConfig;
                            }
                            `,
                        );

                        return {
                            publicPath: packageJson.config?.publicPathFlag
                                ? undefined
                                : webpackPatch?.publicPath,
                        };
                    })();

                    await execShell(
                        [
                            "npm",
                            [
                                "run",
                                "bundle",
                                "--",
                                "--no-lint",
                                "--api", configApiParam,
                                ...(publicPath ? ["--publicPath", publicPath] : []),
                                // eslint-disable-next-line
                                // see possible "buildMode / appMode" values here: https://github.com/ProtonMail/proton-bundler/blob/e366ff769e770c49f5254ebc8ec0ee28cf389e40/lib/tasks/bundle.js#L64-L92
                                // related issue: https://github.com/ProtonMail/WebClient/issues/205
                                // "--buildMode", "standalone" | "sso" | undefined,
                            ],
                            {
                                cwd,
                                ...(publicPath && {env: {...process.env, PUBLIC_PATH: publicPath}}),
                            },
                        ],
                        publicPath ? {printEnvWhitelist: ["PUBLIC_PATH"]} : undefined,
                    );
                },
            },
        });
    }
};
