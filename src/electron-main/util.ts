import fs from "fs";
import logger from "electron-log";
import os from "os";
import path from "path";
import url from "url";
import {app} from "electron";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Model as StoreModel, Store} from "fs-json-store";

import {BuildEnvironment} from "_@shared/model/common";
import {Config, configEncryptionPresetValidator, Settings, settingsAccountLoginUniquenessValidator} from "_@shared/model/options";
import {Context, ContextInitOptions, ContextInitOptionsPaths, RuntimeEnvironment} from "./model";
import {ElectronContextLocations} from "_@shared/model/electron";
import {INITIAL_STORES} from "./constants";
import {MessageFieldContainer} from "_@shared/model/container";
import {Model as KeePassHttpClientModel} from "keepasshttp-client";
import {RUNTIME_ENV__E2E, RUNTIME_ENV__USER_DATA_DIR} from "_@shared/constants";

export async function initContext(options: ContextInitOptions = {}): Promise<Context> {
    const runtimeEnvironment: RuntimeEnvironment = Boolean(process.env[RUNTIME_ENV__E2E]) ? "e2e" : "production";
    const locations = initLocations(runtimeEnvironment, options.paths);
    const initialStores = options.initialStores || INITIAL_STORES;
    const fsOption = options.storeFs ? {fs: options.storeFs} : {};
    const configStore = new Store<Config>({
        ...fsOption,
        optimisticLocking: true,
        file: path.join(locations.userData, "config.json"),
        validators: [configEncryptionPresetValidator],
    });

    logger.transports.file.file = path.join(locations.userData, "./log.log");
    logger.transports.file.level = "info";

    return {
        runtimeEnvironment,
        locations,
        initialStores,
        configStore,
        settingsStore: new Store<Settings>({
            ...fsOption,
            optimisticLocking: true,
            file: path.join(locations.userData, "settings.bin"),
            validators: [settingsAccountLoginUniquenessValidator],
        }),
    };
}

function initLocations(runtimeEnvironment: RuntimeEnvironment, paths?: ContextInitOptionsPaths): ElectronContextLocations {
    const userDataDirRuntimeVal = process.env[RUNTIME_ENV__USER_DATA_DIR];

    if (userDataDirRuntimeVal && (!fs.existsSync(userDataDirRuntimeVal) || !fs.statSync(userDataDirRuntimeVal).isDirectory())) {
        throw new Error(
            `Make sure that custom "userData" dir exists before passing the "${RUNTIME_ENV__USER_DATA_DIR}" environment variable`,
        );
    }

    const {appDir, userDataDir} = paths || {
        appDir: path.join(__dirname, (process.env.NODE_ENV as BuildEnvironment) === "development" ? "../app-dev" : "../app"),
        userDataDir: userDataDirRuntimeVal || app.getPath("userData"),
    };
    const largeIcon = "./assets/icons/icon.png";

    const buildAppPath = (...value: string[]) => path.join(appDir, ...value);
    const formatFileUrl = (pathname: string) => url.format({pathname, protocol: "file:", slashes: true});

    return {
        app: buildAppPath(),
        userData: userDataDir,
        icon: buildAppPath(largeIcon),
        trayIcon: buildAppPath(os.platform() === "darwin" ? "./assets/icons/mac/icon.png" : largeIcon),
        browserWindowPage: (process.env.NODE_ENV as BuildEnvironment) === "development" ? "http://localhost:8080/index.html"
            : formatFileUrl(path.join(appDir, "./web/index.html")),
        preload: {
            browserWindow: buildAppPath("./electron-preload/browser-window.js"),
            browserWindowE2E: buildAppPath("./electron-preload/browser-window-e2e.js"),
            webView: formatFileUrl(buildAppPath("./electron-preload/webview.js")),
        },
    };
}

export async function buildSettingsAdapter({configStore}: Context, password: string): Promise<StoreModel.StoreAdapter> {
    return new EncryptionAdapter(password, (await configStore.readExisting()).encryptionPreset);
}

export function toggleBrowserWindow(ctx: Context, forcedState?: boolean) {
    const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

    if (!browserWindow) {
        return;
    }

    if (typeof forcedState !== "undefined" ? forcedState : !browserWindow.isVisible()) {
        activateBrowserWindow(ctx);
    } else {
        browserWindow.hide();
    }
}

export function activateBrowserWindow({uiContext}: Context) {
    if (!uiContext || !uiContext.browserWindow) {
        return;
    }

    uiContext.browserWindow.show();
    uiContext.browserWindow.focus();
}

export function handleKeePassRequestError(error: any, suppressErrors = false): MessageFieldContainer {
    if (error instanceof KeePassHttpClientModel.Common.NetworkResponseStatusCodeError && error.statusCode === 503) {
        if (suppressErrors) {
            return {message: "Locked"};
        }
        error.message = "KeePass: Locked";
    }
    if (error instanceof KeePassHttpClientModel.Common.NetworkConnectionError) {
        if (suppressErrors) {
            return {message: "No connection"};
        }
        error.message = "KeePass: No connection";
    }
    if (error instanceof KeePassHttpClientModel.Common.NetworkResponseContentError) {
        if (suppressErrors) {
            return {message: "Invalid response"};
        }
        error.message = "KeePass: Invalid response";
    }
    if (suppressErrors) {
        return {message: "Request failed"};
    }
    throw error;
}
