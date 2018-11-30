import electronServe from "electron-serve";
import logger from "electron-log";
import path from "path";
import url from "url";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Fs as StoreFs, Model as StoreModel, Store} from "fs-json-store";
import {app} from "electron";
import {promisify} from "util";

import {BuildEnvironment} from "src/shared/model/common";
import {Config, Settings} from "src/shared/model/options";
import {Context, ContextInitOptions, ContextInitOptionsPaths, RuntimeEnvironment} from "./model";
import {Database} from "./database";
import {ElectronContextLocations} from "src/shared/model/electron";
import {INITIAL_STORES, configEncryptionPresetValidator, settingsAccountLoginUniquenessValidator} from "./constants";
import {LOCAL_WEBCLIENT_PROTOCOL_PREFIX, RUNTIME_ENV_E2E, RUNTIME_ENV_USER_DATA_DIR} from "src/shared/constants";

export async function initContext(options: ContextInitOptions = {}): Promise<Context> {
    const storeFs = options.storeFs ? options.storeFs : StoreFs.Fs.fs;
    const runtimeEnvironment: RuntimeEnvironment = Boolean(process.env[RUNTIME_ENV_E2E]) ? "e2e" : "production";
    const locations = await initLocations(runtimeEnvironment, storeFs, options.paths);

    logger.transports.file.file = path.join(locations.userDataDir, "log.log");
    logger.transports.file.level = false;
    logger.transports.console.level = false;

    const ctx: Context = {
        storeFs,
        runtimeEnvironment,
        locations,
        db: new Database({
            file: path.join(locations.userDataDir, "database.bin"),
            fileFs: storeFs,
            encryption: {
                keyResolver: async () => (await ctx.settingsStore.readExisting()).databaseEncryptionKey,
                presetResolver: async () => ({encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"}}),
            },
        }),
        initialStores: options.initialStores || {config: INITIAL_STORES.config(), settings: INITIAL_STORES.settings()},
        configStore: new Store<Config>({
            fs: storeFs,
            optimisticLocking: true,
            file: path.join(locations.userDataDir, "config.json"),
            validators: [configEncryptionPresetValidator],
        }),
        settingsStore: new Store<Settings>({
            fs: storeFs,
            optimisticLocking: true,
            file: path.join(locations.userDataDir, "settings.bin"),
            validators: [settingsAccountLoginUniquenessValidator],
        }),
    };

    return ctx;
}

async function initLocations(
    runtimeEnvironment: RuntimeEnvironment,
    storeFs: StoreModel.StoreFs,
    paths?: ContextInitOptionsPaths,
): Promise<ElectronContextLocations> {
    const userDataDirRuntimeVal = process.env[RUNTIME_ENV_USER_DATA_DIR];

    if (userDataDirRuntimeVal && !(await directoryExists(userDataDirRuntimeVal, storeFs))) {
        throw new Error(
            `Make sure that custom "userData" dir exists before passing the "${RUNTIME_ENV_USER_DATA_DIR}" environment variable`,
        );
    }

    const {appDir, userDataDir} = paths || {
        appDir: path.resolve(__dirname, (process.env.NODE_ENV as BuildEnvironment) === "development" ? "../app-dev" : "../app"),
        userDataDir: userDataDirRuntimeVal || app.getPath("userData"),
    };
    const appRelativePath = (...value: string[]) => path.join(appDir, ...value);
    const icon = appRelativePath("./assets/icons/icon.png");
    const protonmailWebClientsDir = path.join(appDir, "./webclient/protonmail");
    const webClients = await (async () => {
        let index = 0;
        return {
            protonmail: (await listDirs(storeFs, protonmailWebClientsDir)).map((dirName) => {
                const directory = path.join(protonmailWebClientsDir, dirName);
                const scheme = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}${index++}`;

                electronServe({scheme, directory});

                return {
                    entryUrl: `${scheme}://${dirName}`,
                    entryApiUrl: `https://${dirName}`,
                };
            }),
        };
    })();

    return {
        appDir,
        userDataDir,
        icon,
        trayIcon: icon,
        numbersFont: appRelativePath("./assets/numbers.ttf"),
        browserWindowPage: (process.env.NODE_ENV as BuildEnvironment) === "development" ? "http://localhost:8080/index.html"
            : formatFileUrl(path.join(appDir, "./web/index.html")),
        preload: {
            browserWindow: appRelativePath("./electron-preload/browser-window.js"),
            browserWindowE2E: appRelativePath("./electron-preload/browser-window-e2e.js"),
            webView: {
                protonmail: formatFileUrl(appRelativePath("./electron-preload/webview/protonmail.js")),
                tutanota: formatFileUrl(appRelativePath("./electron-preload/webview/tutanota.js")),
            },
        },
        webClients,
    };
}

function formatFileUrl(pathname: string) {
    return url.format({pathname, protocol: "file:", slashes: true});
}

async function listDirs(storeFs: StoreModel.StoreFs, dir: string): Promise<string[]> {
    const result: string[] = [];
    if (!(await exists(dir, storeFs))) {
        return result;
    }
    const files: string[] = await promisify(storeFs._impl.readdir)(dir);
    for (const file of files) {
        if (await directoryExists(file, storeFs)) {
            result.push(file);
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

async function exists(file: string, storeFs: StoreModel.StoreFs): Promise<boolean> {
    try {
        await promisify(storeFs._impl.stat)(file);
        return true;
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

async function directoryExists(file: string, storeFs: StoreModel.StoreFs): Promise<boolean> {
    if (!(await exists(file, storeFs))) {
        return false;
    }
    const stat = await promisify(storeFs._impl.stat)(file);
    return stat.isDirectory;
}
