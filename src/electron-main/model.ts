import {Model as StoreModel} from "fs-json-store";

import {Config, Settings} from "src/shared/model/options";
import {ElectronContextLocations} from "src/shared/model/electron";
import {Db} from "./database/db";

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
    readonly db: Db;
    readonly storeFs: StoreModel.StoreFs;
    readonly runtimeEnvironment: RuntimeEnvironment;
    readonly locations: ElectronContextLocations;
    readonly initialStores: {
        config: Config;
        settings: Settings;
    };
    readonly configStore: StoreModel.Store<Config>;
    settingsStore: StoreModel.Store<Settings>;
    uiContext?: UIContext;
}

export interface UIContext {
    browserWindow: Electron.BrowserWindow;
    tray: Electron.Tray;
}
