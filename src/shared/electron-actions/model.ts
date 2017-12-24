export enum IpcMainChannel {
    AddAccount = "AddAccount",
    AssociateSettingsWithKeePass = "AssociateSettingsWithKeePass",
    ChangeMasterPassword = "ChangeMasterPassword",
    Init = "Init",
    KeePassRecordRequest = "KeePassRecordRequest",
    Logout = "Logout",
    OpenAboutWindow = "OpenAboutWindow",
    OpenExternal = "OpenExternal",
    OpenSettingsFolder = "OpenSettingsFolder",
    Quit = "Quit",
    ReadConfig = "ReadConfig",
    ReadSettings = "ReadSettings",
    ReadSettingsAuto = "ReadSettingsAuto",
    RemoveAccount = "RemoveAccount",
    SettingsExists = "SettingsExists",
    ToggleBrowserWindow = "ToggleBrowserWindow",
    ToggleCompactLayout = "ToggleCompactLayout",
    UpdateAccount = "UpdateAccount",
    UpdateOverlayIcon = "UpdateOverlayIcon",
}

export enum IpcRendererChannel {
    AccountNotification = "account:notification",
    AccountFillLogin = "account:fill-login",
    AccountLogin = "account:login",
    AccountUnlock = "account:unlock",
}

export interface ElectronActionType<T extends IpcMainChannel | IpcRendererChannel> {
    i: any; // TODO use "grouping" "ElectronActionType.i" interface
    o: any; // TODO use "grouping" "ElectronActionType.o" interface
    c: T;
}

export interface ElectronIpcMainActionType extends ElectronActionType<IpcMainChannel> {}

export interface ElectronIpcRendererActionType extends ElectronActionType<IpcRendererChannel> {}

export class ElectronIpcMainAction<T extends ElectronIpcMainActionType> {
    constructor(public channel: T["c"], public process: (args: T["i"]) => Promise<T["o"]>) {}
}

export class ElectronIpcRendererAction<T extends ElectronIpcRendererActionType> {
    constructor(public channel: T["c"], public process: (args: T["i"]) => Promise<T["o"]>) {}
}
