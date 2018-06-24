import {Model as StoreModel} from "fs-json-store";

import {Config, Settings} from "_@shared/model/options";
import {ElectronContextLocations} from "_@shared/model/electron";

export type RuntimeEnvironment = "e2e" | "production";

export interface ContextInitOptions {
    paths?: { userData: string, app: string };
    initialStores?: { config: Config; settings: Settings; };
    storeFs?: StoreModel.StoreFs;
}

export interface Context {
    readonly runtimeEnvironment: RuntimeEnvironment;
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
