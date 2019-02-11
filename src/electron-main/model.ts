import {Deferred} from "ts-deferred";
import {Model as StoreModel} from "fs-json-store";

import {Config, Settings} from "src/shared/model/options";
import {Database} from "./database";
import {ElectronContextLocations} from "src/shared/model/electron";
import {Endpoints} from "src/shared/api/main";

export type RuntimeEnvironment = "e2e" | "production";

export interface ContextInitOptionsPaths {
    appDir: string;
    userDataDir: string;
}

export interface ContextInitOptions {
    paths?: ContextInitOptionsPaths;
    initialStores?: { config: Config; settings: Settings; };
    storeFs?: StoreModel.StoreFs;
}

export interface Context {
    readonly db: Database;
    readonly storeFs: StoreModel.StoreFs;
    readonly runtimeEnvironment: RuntimeEnvironment;
    readonly locations: ElectronContextLocations;
    readonly deferredEndpoints: Deferred<Endpoints>;
    readonly initialStores: {
        config: Config;
        settings: Settings;
    };
    readonly configStore: StoreModel.Store<Config>;
    keytarSupport?: boolean;
    snapPasswordManagerServiceHint?: boolean;
    settingsStore: StoreModel.Store<Settings>;
    uiContext?: UIContext;
    selectedAccount?: {
        webContentId: number;
        databaseView?: boolean;
    };
}

export interface UIContext {
    readonly browserWindow: Electron.BrowserWindow;
    fullTextSearchBrowserWindow?: Electron.BrowserWindow;
    findInPageBrowserView?: Electron.BrowserView;
    readonly tray: Electron.Tray;
    readonly appMenu: Electron.Menu;
}
