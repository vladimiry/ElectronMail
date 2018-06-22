import {ApiMethod, IpcMainApiService} from "electron-rpc-api";
// tslint:disable-next-line:no-unused-variable
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {
    AccountConfigPatch,
    KeePassClientConfFieldContainer,
    KeePassRefFieldContainer,
    LoginFieldContainer,
    MessageFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
    UrlFieldContainer,
} from "_shared/model/container";
// tslint:disable-next-line:no-unused-variable
import {ElectronContextLocations} from "_shared/model/electron";
import {BaseConfig, Config, Settings} from "_shared/model/options";

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigPatch, Settings>;
    associateSettingsWithKeePass: ApiMethod<UrlFieldContainer, Settings>;
    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;
    init: ApiMethod<undefined, { electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>;
    // tslint:disable-next-line:max-line-length
    keePassRecordRequest: ApiMethod<KeePassRefFieldContainer & KeePassClientConfFieldContainer & { suppressErrors: boolean }, Partial<PasswordFieldContainer & MessageFieldContainer>>;
    logout: ApiMethod<undefined, never>;
    openAboutWindow: ApiMethod<undefined, never>;
    openExternal: ApiMethod<{ url: string }, never>;
    openSettingsFolder: ApiMethod<undefined, never>;
    patchBaseSettings: ApiMethod<BaseConfig, Config>;
    quit: ApiMethod<undefined, never>;
    readConfig: ApiMethod<undefined, Config>;
    readSettings: ApiMethod<PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean }, Settings>;
    readSettingsAuto: ApiMethod<undefined, Settings | never>;
    reEncryptSettings: ApiMethod<PasswordFieldContainer & { encryptionPreset: EncryptionAdapterOptions }, Settings>;
    removeAccount: ApiMethod<LoginFieldContainer, Settings>;
    settingsExists: ApiMethod<undefined, boolean>;
    toggleBrowserWindow: ApiMethod<{ forcedState?: boolean }, never>;
    toggleCompactLayout: ApiMethod<undefined, Config>;
    updateAccount: ApiMethod<AccountConfigPatch, Settings>;
    updateOverlayIcon: ApiMethod<{ count: number; dataURL?: string; }, never>;
}

// TODO pick "channel" from "package.json => name"
export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: "protonmail-desktop-app:ipcMain-api"});
