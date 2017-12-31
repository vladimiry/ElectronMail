import {Model as StoreModel} from "fs-json-store";

import {ElectronIpcMainAction} from "_shared/electron-actions/model";
import {ElectronContextLocations, Environment} from "_shared/model/electron";
import {IpcMainActions} from "_shared/electron-actions";
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

    configInstance(): Config;

    buildSettingsAdapter(password: string): Promise<StoreModel.StoreAdapter>;

    on(event: "toggleBrowserWindow", listener: (forcedState?: boolean) => void): void;

    emit(event: "toggleBrowserWindow", forcedState?: boolean): boolean;
}

export interface UIContext {
    browserWindow: Electron.BrowserWindow;
    tray: Electron.Tray;
}

// TODO limit object HandlersMap.key by IpcMainChannel enum members https://github.com/Microsoft/TypeScript/issues/2491
// export interface HandlersMap extends Record<keyof IpcMainChannel, any> {
export interface EndpointsMap extends Record<string, any> {
    "AddAccount": ElectronIpcMainAction<IpcMainActions.AddAccount.Type>;
    "AssociateSettingsWithKeePass": ElectronIpcMainAction<IpcMainActions.AssociateSettingsWithKeePass.Type>;
    "ChangeMasterPassword": ElectronIpcMainAction<IpcMainActions.ChangeMasterPassword.Type>;
    "Init": ElectronIpcMainAction<IpcMainActions.Init.Type>;
    "KeePassRecordRequest": ElectronIpcMainAction<IpcMainActions.KeePassRecordRequest.Type>;
    "Logout": ElectronIpcMainAction<IpcMainActions.Logout.Type>;
    "OpenAboutWindow": ElectronIpcMainAction<IpcMainActions.OpenAboutWindow.Type>;
    "OpenExternal": ElectronIpcMainAction<IpcMainActions.OpenExternal.Type>;
    "OpenSettingsFolder": ElectronIpcMainAction<IpcMainActions.OpenSettingsFolder.Type>;
    "PatchBaseSettings": ElectronIpcMainAction<IpcMainActions.PatchBaseSettings.Type>;
    "Quit": ElectronIpcMainAction<IpcMainActions.Quit.Type>;
    "ReadConfig": ElectronIpcMainAction<IpcMainActions.ReadConfig.Type>;
    "ReadSettings": ElectronIpcMainAction<IpcMainActions.ReadSettings.Type>;
    "ReadSettingsAuto": ElectronIpcMainAction<IpcMainActions.ReadSettingsAuto.Type>;
    "RemoveAccount": ElectronIpcMainAction<IpcMainActions.RemoveAccount.Type>;
    "SettingsExists": ElectronIpcMainAction<IpcMainActions.SettingsExists.Type>;
    "ToggleBrowserWindow": ElectronIpcMainAction<IpcMainActions.ToggleBrowserWindow.Type>;
    "ToggleCompactLayout": ElectronIpcMainAction<IpcMainActions.ToggleCompactLayout.Type>;
    "UpdateAccount": ElectronIpcMainAction<IpcMainActions.UpdateAccount.Type>;
}
