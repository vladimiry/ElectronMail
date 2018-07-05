import {ApiMethod, ApiMethodNoArgument, IpcMainApiService} from "electron-rpc-api";
// tslint:disable-next-line:no-unused-variable
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {
    AccountConfigCreatePatch,
    AccountConfigPatch,
    KeePassClientConfFieldContainer,
    KeePassRefFieldContainer,
    LoginFieldContainer,
    MessageFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
    UrlFieldContainer,
} from "_@shared/model/container";
// tslint:disable-next-line:no-unused-variable
import {ElectronContextLocations} from "_@shared/model/electron";
import {BaseConfig, Config, Settings} from "_@shared/model/options";

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;
    associateSettingsWithKeePass: ApiMethod<UrlFieldContainer, Settings>;
    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;
    init: ApiMethodNoArgument<{ electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>;
    // tslint:disable-next-line:max-line-length
    keePassRecordRequest: ApiMethod<KeePassRefFieldContainer & KeePassClientConfFieldContainer & { suppressErrors: boolean }, Partial<PasswordFieldContainer & MessageFieldContainer>>;
    logout: ApiMethodNoArgument<never>;
    openAboutWindow: ApiMethodNoArgument<never>;
    openExternal: ApiMethod<{ url: string }, never>;
    openSettingsFolder: ApiMethodNoArgument<never>;
    patchBaseSettings: ApiMethod<BaseConfig, Config>;
    quit: ApiMethodNoArgument<never>;
    readConfig: ApiMethodNoArgument<Config>;
    readSettings: ApiMethod<PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean }, Settings>;
    readSettingsAuto: ApiMethodNoArgument<Settings | never>;
    reEncryptSettings: ApiMethod<PasswordFieldContainer & { encryptionPreset: EncryptionAdapterOptions }, Settings>;
    removeAccount: ApiMethod<LoginFieldContainer, Settings>;
    settingsExists: ApiMethodNoArgument<boolean>;
    toggleBrowserWindow: ApiMethod<{ forcedState?: boolean }, never>;
    toggleCompactLayout: ApiMethodNoArgument<Config>;
    updateAccount: ApiMethod<AccountConfigPatch, Settings>;
    updateOverlayIcon: ApiMethod<{ unread: number }, never>;
}

export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: `${process.env.APP_ENV_PACKAGE_NAME}:ipcMain-api`});
