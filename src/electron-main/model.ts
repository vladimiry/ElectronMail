import {Deferred} from "ts-deferred";
import {Model as StoreModel} from "fs-json-store";

import {Config, Settings} from "src/shared/model/options";
import {Database} from "./database";
import {ElectronContextLocations} from "src/shared/model/electron";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {SessionStorage} from "src/electron-main/session-storage";
import {Controller as SpellCheckController} from "src/electron-main/spell-check/model";

export interface ContextInitOptionsPaths {
    appDir: string;
    userDataDir: string;
}

export interface ContextInitOptions {
    paths?: ContextInitOptionsPaths;
    initialStores?: { config: Config; settings: Settings };
    storeFs?: StoreModel.StoreFs;
}

export interface Context {
    readonly db: Database;
    readonly sessionDb: Database;
    readonly storeFs: StoreModel.StoreFs;
    readonly locations: ElectronContextLocations;
    readonly deferredEndpoints: Deferred<IpcMainApiEndpoints>;
    readonly initialStores: {
        config: Config;
        settings: Settings;
    };
    readonly config$: import("rxjs").Observable<Config>;
    readonly configStore: StoreModel.Store<Config>;
    readonly configStoreQueue: import("asap-es").IASAP;
    keytarSupport?: boolean;
    snapPasswordManagerServiceHint?: boolean;
    settingsStore: StoreModel.Store<Settings>;
    readonly settingsStoreQueue: import("asap-es").IASAP;
    readonly sessionStorage: SessionStorage;
    uiContext?: Promise<UIContext>;
    selectedAccount?: {
        webContentId: number;
        databaseView?: boolean;
    };
    getSpellCheckController: () => SpellCheckController;
    userAgentsPool?: Config["userAgents"];
}

export interface UIContext {
    readonly browserWindow: Electron.BrowserWindow;
    aboutBrowserWindow?: Electron.BrowserWindow;
    fullTextSearchBrowserWindow?: Electron.BrowserWindow;
    findInPageBrowserView?: Electron.BrowserView & {
        // TODO TS / electron v11: drop custom "BrowserView.isDestroyed/destroy" methods declarations
        //      https://github.com/electron/electron/pull/25112
        //      https://github.com/electron/electron/issues/26929
        //      https://github.com/electron/electron/issues/29626
        webContents: { destroy?: () => void }
    }
    readonly tray: Electron.Tray;
    readonly appMenu: Electron.Menu;
}

export interface ProperLockfileError {
    message: string
    code: "ELOCKED"
    file: string
}
