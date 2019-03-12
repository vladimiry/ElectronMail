import logger from "electron-log";
import path from "path";
import url from "url";
import {Deferred} from "ts-deferred";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Fs as StoreFs, Model as StoreModel, Store} from "fs-json-store";
import {app} from "electron";

import {AccountType} from "src/shared/model/account";
import {BuildEnvironment} from "src/shared/model/common";
import {Config, Settings} from "src/shared/model/options";
import {Context, ContextInitOptions, ContextInitOptionsPaths, RuntimeEnvironment} from "./model";
import {Database} from "./database";
import {ElectronContextLocations} from "src/shared/model/electron";
import {INITIAL_STORES, configEncryptionPresetValidator, settingsAccountLoginUniquenessValidator} from "./constants";
import {LOCAL_WEBCLIENT_PROTOCOL_PREFIX, RUNTIME_ENV_E2E, RUNTIME_ENV_USER_DATA_DIR} from "src/shared/constants";

const developmentEnv = (process.env.NODE_ENV as BuildEnvironment) === "development";

export function initContext(options: ContextInitOptions = {}): Context {
    const storeFs = options.storeFs
        ? options.storeFs
        : StoreFs.Fs.volume({
            writeFileAtomicOptions: {
                fsync: false,
                disableChmod: true,
                disableChown: true,
            },
            fsNoEpermAnymore: {
                items: [
                    {
                        platforms: ["win32"],
                        errorCodes: ["EPERM", "EBUSY"],
                        options: {
                            retryIntervalMs: 100, // every 100 ms
                            retryTimeoutMs: 5 * 1000, // 5 seconds
                        },
                    },
                ],
            },
        });
    const runtimeEnvironment: RuntimeEnvironment = Boolean(process.env[RUNTIME_ENV_E2E]) ? "e2e" : "production";
    const locations = initLocations(runtimeEnvironment, storeFs, options.paths);

    logger.transports.file.file = path.join(locations.userDataDir, "log.log");
    logger.transports.file.maxSize = 1024 * 1024 * 50; // 50MB
    logger.transports.file.level = false;
    logger.transports.console.level = false;

    const ctx: Context = {
        storeFs,
        runtimeEnvironment,
        locations,
        deferredEndpoints: new Deferred(),
        db: new Database(
            {
                file: path.join(locations.userDataDir, "database.bin"),
                encryption: {
                    keyResolver: async () => (await ctx.settingsStore.readExisting()).databaseEncryptionKey,
                    presetResolver: async () => ({encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"}}),
                },
            },
            storeFs,
        ),
        initialStores: options.initialStores || {config: INITIAL_STORES.config(), settings: INITIAL_STORES.settings()},
        configStore: new Store<Config>({
            fs: storeFs,
            optimisticLocking: true,
            file: path.join(locations.userDataDir, "config.json"),
            validators: [configEncryptionPresetValidator],
            serialize: (data) => Buffer.from(JSON.stringify(data, null, 2)),
        }),
        settingsStore: new Store<Settings>({
            fs: storeFs,
            optimisticLocking: true,
            file: path.join(locations.userDataDir, "settings.bin"),
            validators: [settingsAccountLoginUniquenessValidator],
        }),
        keytarSupport: true,
    };

    return ctx;
}

function initLocations(
    runtimeEnvironment: RuntimeEnvironment,
    storeFs: StoreModel.StoreFs,
    paths?: ContextInitOptionsPaths,
): ElectronContextLocations {
    const customUserDataDir = process.env[RUNTIME_ENV_USER_DATA_DIR];

    if (customUserDataDir && !directoryExists(customUserDataDir, storeFs)) {
        throw new Error(
            `Make sure that custom "userData" dir exists before passing the "${RUNTIME_ENV_USER_DATA_DIR}" environment variable`,
        );
    }

    const {appDir, userDataDir} = paths || {
        appDir: path.resolve(__dirname, developmentEnv ? "../app-dev" : "../app"),
        userDataDir: customUserDataDir || app.getPath("userData"),
    };
    const appRelativePath = (...value: string[]) => path.join(appDir, ...value);
    const icon = appRelativePath("./assets/icons/icon.png");

    return {
        appDir,
        userDataDir,
        icon,
        trayIcon: icon,
        numbersFont: appRelativePath("./assets/numbers.ttf"),
        browserWindowPage: developmentEnv
            ? "http://localhost:8080/index.html"
            : formatFileUrl(appRelativePath("./web/index.html")),
        searchInPageBrowserViewPage: developmentEnv
            ? "http://localhost:8080/search-in-page-browser-view.html"
            : formatFileUrl(appRelativePath("./web/search-in-page-browser-view.html")),
        preload: {
            browserWindow: appRelativePath("./electron-preload/browser-window.js"),
            browserWindowE2E: appRelativePath("./electron-preload/browser-window-e2e.js"),
            searchInPageBrowserView: appRelativePath("./electron-preload/search-in-page-browser-view.js"),
            fullTextSearchBrowserWindow: appRelativePath("./electron-preload/database-indexer.js"),
            webView: {
                protonmail: formatFileUrl(appRelativePath("./electron-preload/webview/protonmail.js")),
                tutanota: formatFileUrl(appRelativePath("./electron-preload/webview/tutanota.js")),
            },
        },
        ...(() => {
            const {protocolBundles, webClients}: Pick<ElectronContextLocations, "protocolBundles" | "webClients"> = {
                protocolBundles: [],
                webClients: {
                    protonmail: [],
                    tutanota: [],
                },
            };

            let schemeIndex = 0;

            (Object.keys(webClients) as AccountType[]).map((accountType) => {
                const webClientsDir = appRelativePath("./webclient", `./${accountType}`);

                listDirsNames(storeFs, webClientsDir)
                    .map((dirName) => {
                        const directory = path.resolve(webClientsDir, dirName);
                        const scheme = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}${schemeIndex++}`;

                        webClients[accountType].push({
                            entryUrl: `${scheme}://${dirName}`,
                            entryApiUrl: `https://${dirName}`,
                        });

                        protocolBundles.push({
                            scheme,
                            directory,
                        });
                    });
            });

            return {protocolBundles, webClients};
        })(),
    };
}

function formatFileUrl(pathname: string) {
    return url.format({pathname, protocol: "file:", slashes: true});
}

function listDirsNames(storeFs: StoreModel.StoreFs, dir: string): string[] {
    const result: string[] = [];
    if (!(exists(dir, storeFs))) {
        return result;
    }
    const files: string[] = storeFs._impl.readdirSync(dir);
    for (const dirName of files) {
        const dirPath = path.join(dir, dirName);
        if (directoryExists(dirPath, storeFs)) {
            result.push(dirName);
        }
    }
    return result;
}

export async function buildSettingsAdapter({configStore}: Context, password: string): Promise<StoreModel.StoreAdapter> {
    return new EncryptionAdapter(
        {password, preset: (await configStore.readExisting()).encryptionPreset},
        {keyDerivationCache: true, keyDerivationCacheLimit: 3},
    );
}

export function hrtimeDuration(): { end: () => number } {
    const start = process.hrtime();

    return {
        end() {
            const time = process.hrtime(start);

            return Math.round((time[0] * 1000) + (time[1] / 1000000));
        },
    };
}

function exists(file: string, storeFs: StoreModel.StoreFs): boolean {
    try {
        storeFs._impl.statSync(file);
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }

        throw error;
    }

    return true;
}

function directoryExists(file: string, storeFs: StoreModel.StoreFs = StoreFs.Fs.fs): boolean {
    if (!(exists(file, storeFs))) {
        return false;
    }

    const stat = storeFs._impl.statSync(file);

    return stat.isDirectory;
}
