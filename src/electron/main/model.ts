import {Model as StoreModel} from "fs-json-store";

import {ElectronIpcMainAction, IpcMainChannel} from "_shared/electron-actions/model";
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
    forceClose?: boolean;
    uiContext?: UIContext;
}

export interface UIContext {
    browserWindow: Electron.BrowserWindow;
    tray: Electron.Tray;
}

// TODO extend Record<IpcMainChannel, <? extends ElectronIpcMainActionType>> type (wildcard generic)
export interface EndpointsMap extends Record<IpcMainChannel, any> {
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
    "ReEncryptSettings": ElectronIpcMainAction<IpcMainActions.ReEncryptSettings.Type>;
    "RemoveAccount": ElectronIpcMainAction<IpcMainActions.RemoveAccount.Type>;
    "SettingsExists": ElectronIpcMainAction<IpcMainActions.SettingsExists.Type>;
    "ToggleBrowserWindow": ElectronIpcMainAction<IpcMainActions.ToggleBrowserWindow.Type>;
    "ToggleCompactLayout": ElectronIpcMainAction<IpcMainActions.ToggleCompactLayout.Type>;
    "UpdateAccount": ElectronIpcMainAction<IpcMainActions.UpdateAccount.Type>;
    "UpdateOverlayIcon": ElectronIpcMainAction<IpcMainActions.UpdateOverlayIcon.Type>;
}
