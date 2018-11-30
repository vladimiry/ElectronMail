import electronServe from "electron-serve";
import fs from "fs";
import logger from "electron-log";
import path from "path";
import url from "url";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Fs as StoreFs, Model as StoreModel, Store} from "fs-json-store";
import {app} from "electron";

import {BuildEnvironment} from "src/shared/model/common";
import {Config, Settings} from "src/shared/model/options";
import {Context, ContextInitOptions, ContextInitOptionsPaths, RuntimeEnvironment} from "./model";
import {Database} from "./database";
import {ElectronContextLocations} from "src/shared/model/electron";
import {INITIAL_STORES, configEncryptionPresetValidator, settingsAccountLoginUniquenessValidator} from "./constants";
import {LOCAL_WEBCLIENT_PROTOCOL_PREFIX, RUNTIME_ENV_E2E, RUNTIME_ENV_USER_DATA_DIR} from "src/shared/constants";

export function initContext(options: ContextInitOptions = {}): Context {
    const storeFs = options.storeFs ? options.storeFs : StoreFs.Fs.fs;
    const runtimeEnvironment: RuntimeEnvironment = Boolean(process.env[RUNTIME_ENV_E2E]) ? "e2e" : "production";
    const locations = initLocations(runtimeEnvironment, options.paths);

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

function initLocations(runtimeEnvironment: RuntimeEnvironment, paths?: ContextInitOptionsPaths): ElectronContextLocations {
    const userDataDirRuntimeVal = process.env[RUNTIME_ENV_USER_DATA_DIR];

    if (userDataDirRuntimeVal && (!fs.existsSync(userDataDirRuntimeVal) || !fs.statSync(userDataDirRuntimeVal).isDirectory())) {
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
    let webclientIdx = 0;

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
        webClients: {
            protonmail: listDirs(protonmailWebClientsDir).map((dirName) => {
                const directory = path.join(protonmailWebClientsDir, dirName);
                const scheme = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}${webclientIdx++}`;

                electronServe({scheme, directory});

                return {
                    entryUrl: `${scheme}://${dirName}`,
                    entryApiUrl: `https://${dirName}`,
                };
            }),
        },
    };
}

function formatFileUrl(pathname: string) {
    return url.format({pathname, protocol: "file:", slashes: true});
}

function listDirs(dir: string): string[] {
    return fs
        .readdirSync(dir)
        .filter((file) => fs
            .statSync(path.join(dir, file))
            .isDirectory(),
        );
}

export async function buildSettingsAdapter({configStore}: Context, password: string): Promise<StoreModel.StoreAdapter> {
    return new EncryptionAdapter(
        {password, preset: (await configStore.readExisting()).encryptionPreset},
        {keyDerivationCache: true, keyDerivationCacheLimit: 3},
    );
}
