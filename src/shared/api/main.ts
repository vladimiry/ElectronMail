import {ApiMethod, ApiMethodNoArgument, IpcMainApiService} from "electron-rpc-api";
// tslint:disable-next-line:no-unused-variable
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {
    AccountConfigCreatePatch,
    AccountConfigUpdatePatch,
    KeePassClientConfFieldContainer,
    KeePassRefFieldContainer,
    LoginFieldContainer,
    MessageFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
    UrlFieldContainer,
} from "src/shared/model/container";
import {APP_NAME} from "src/shared/constants";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
// TODO figure why tslint detects "ElectronContextLocations" as unused
// tslint:disable-next-line:no-unused-variable
import {ElectronContextLocations} from "src/shared/model/electron";

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;
    associateSettingsWithKeePass: ApiMethod<UrlFieldContainer, Settings>;
    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;
    init: ApiMethodNoArgument<{ electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>;
    keePassRecordRequest: ApiMethod<KeePassRefFieldContainer & KeePassClientConfFieldContainer
        & { suppressErrors: boolean }, Partial<PasswordFieldContainer & MessageFieldContainer>>;
    logout: ApiMethodNoArgument<never>;
    openAboutWindow: ApiMethodNoArgument<never>;
    openExternal: ApiMethod<{ url: string }, never>;
    openSettingsFolder: ApiMethodNoArgument<never>;
    patchBaseSettings: ApiMethod<BaseConfig, Config>;
    quit: ApiMethodNoArgument<never>;
    readConfig: ApiMethodNoArgument<Config>;
    readSettings: ApiMethod<Partial<PasswordFieldContainer> & { savePassword?: boolean; }, Settings>;
    reEncryptSettings: ApiMethod<PasswordFieldContainer & { encryptionPreset: EncryptionAdapterOptions }, Settings>;
    removeAccount: ApiMethod<LoginFieldContainer, Settings>;
    settingsExists: ApiMethodNoArgument<boolean>;
    toggleBrowserWindow: ApiMethod<{ forcedState?: boolean }, never>;
    toggleCompactLayout: ApiMethodNoArgument<Config>;
    updateAccount: ApiMethod<AccountConfigUpdatePatch, Settings>;
    updateOverlayIcon: ApiMethod<{ hasLoggedOut: boolean, unread: number }, never>;
}

export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: `${APP_NAME}:ipcMain-api`});
