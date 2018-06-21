import * as path from "path";
import * as url from "url";
import * as os from "os";

import logger from "electron-log";
import {app} from "electron";
import {Model as StoreModel, Store} from "fs-json-store";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";

import {Config, configEncryptionPresetValidator, Settings, settingsAccountLoginUniquenessValidator} from "_shared/model/options";
import {Environment} from "_shared/model/electron";
import {Context, ContextInitOptions} from "./model";
import {INITIAL_STORES} from "./constants";
import {Model as KeePassHttpClientModel} from "keepasshttp-client";
import {MessageFieldContainer} from "_shared/model/container";

export async function initContext(opts: ContextInitOptions = {}): Promise<Context> {
    const env: Environment = process.env.NODE_ENV_RUNTIME === "development"
        ? "development"
        : process.env.NODE_ENV_RUNTIME === "e2e"
            ? "e2e"
            : "production";
    const locations = await (async () => {
        const formatFileUrl = (pathname: string) => url.format({pathname, protocol: "file:", slashes: true});
        const paths = opts.paths || {
            app: path.join(__dirname, "../../../app"),
            userData: env === "e2e"
                ? process.env.TEST_USER_DATA_DIR as string
                : app.getPath("userData"),
        };
        const iconFile = "./assets/icons/icon.png";

        return {
            data: paths.userData,
            app: paths.app,
            page: env === "development"
                ? "http://localhost:3000/index.html"
                : formatFileUrl(path.join(paths.app, "./web/index.html")),
            icon: path.join(paths.app, iconFile),
            trayIcon: path.join(paths.app, os.platform() === "darwin" ? "./assets/icons/mac/icon.png" : iconFile),
            preload: {
                browser: {
                    production: path.join(paths.app, "./electron/renderer/browser-window-production-env.js"),
                    development: path.join(paths.app, "./electron/renderer/browser-window-development-env.js"),
                    e2e: path.join(paths.app, "./electron/renderer/browser-window-e2e-env.js"),
                },
                account: formatFileUrl(path.join(paths.app, "./electron/renderer/account.js")),
            },
        };
    })();
    const initialStores = opts.initialStores || INITIAL_STORES;
    const fsOption = opts.storeFs ? {fs: opts.storeFs} : {};
    const configStore = new Store<Config>({
        ...fsOption,
        optimisticLocking: true,
        file: path.join(locations.data, "config.json"),
        validators: [configEncryptionPresetValidator],
    });

    logger.transports.file.file = path.join(locations.data, "./log.log");
    logger.transports.file.level = "info";

    return {
        env,
        locations,
        initialStores,
        configStore,
        settingsStore: new Store<Settings>({
            ...fsOption,
            optimisticLocking: true,
            file: path.join(locations.data, "settings.bin"),
            validators: [settingsAccountLoginUniquenessValidator],
        }),
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
