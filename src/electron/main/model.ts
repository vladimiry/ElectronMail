import {Model as StoreModel} from "fs-json-store";

import {ElectronContextLocations, Environment} from "_shared/model/electron";
import {Config, Settings} from "_shared/model/options";

export interface ContextInitOptions {
    paths?: { userData: string, app: string };
    initialStores?: { config: Config; settings: Settings; };
    storeFs?: StoreModel.StoreFs;
}

export interface Context {
    readonly env: Environment;
    readonly locations: ElectronContextLocations;
    initialStores: {
        config: Config;
        settings: Settings;
    };
    configStore: StoreModel.Store<Config>;
    settingsStore: StoreModel.Store<Settings>;
    uiContext?: UIContext;
}

export interface UIContext {
    browserWindow: Electron.BrowserWindow;
    tray: Electron.Tray;
}
