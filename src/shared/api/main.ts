import {ApiMethod, ApiMethodNoArgument, IpcMainApiService} from "electron-rpc-api";
// tslint:disable-next-line:no-unused-variable // TODO figure why tslint detects below import as unused
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {
    AccountConfigCreatePatch,
    AccountConfigUpdatePatch,
    AccountTypeAndLoginFieldContainer,
    KeePassClientConfFieldContainer,
    KeePassRefFieldContainer,
    LoginFieldContainer,
    MessageFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
    UrlFieldContainer,
} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {BatchEntityUpdatesDbPatch} from "./common";

// tslint:disable:no-unused-variable // TODO figure why tslint detects below imports as unused
import {APP_NAME} from "src/shared/constants";
import {ElectronContextLocations} from "src/shared/model/electron";
import {DbContent, Folder, Mail} from "src/shared/model/database";
// tslint:enable:no-unused-variable

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;
    updateAccount: ApiMethod<AccountConfigUpdatePatch, Settings>;
    changeAccountOrder: ApiMethod<LoginFieldContainer & { index: number }, Settings>;
    removeAccount: ApiMethod<LoginFieldContainer, Settings>;

    associateSettingsWithKeePass: ApiMethod<UrlFieldContainer, Settings>;

    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;

    dbInsertBootstrapContent: ApiMethod<AccountTypeAndLoginFieldContainer & { mails: Mail[]; folders: Folder[] }
        & {metadata: Partial<DbContent["metadata"]>}, DbContent["metadata"]>;
    dbProcessBatchEntityUpdatesPatch: ApiMethod<AccountTypeAndLoginFieldContainer & BatchEntityUpdatesDbPatch
        & {metadata: Partial<DbContent["metadata"]>}, DbContent["metadata"]>;
    dbGetContentMetadata: ApiMethod<AccountTypeAndLoginFieldContainer, DbContent["metadata"]>;

    init: ApiMethodNoArgument<{ electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>;

    keePassRecordRequest: ApiMethod<KeePassRefFieldContainer & KeePassClientConfFieldContainer
        & { suppressErrors: boolean }, Partial<PasswordFieldContainer & MessageFieldContainer>>;

    logout: ApiMethodNoArgument<null>;

    openAboutWindow: ApiMethodNoArgument<null>;

    openExternal: ApiMethod<{ url: string }, null>;

    openSettingsFolder: ApiMethodNoArgument<null>;

    patchBaseConfig: ApiMethod<BaseConfig, Config>;

    quit: ApiMethodNoArgument<null>;

    readConfig: ApiMethodNoArgument<Config>;

    readSettings: ApiMethod<Partial<PasswordFieldContainer> & { savePassword?: boolean; }, Settings>;

    reEncryptSettings: ApiMethod<PasswordFieldContainer & { encryptionPreset: EncryptionAdapterOptions }, Settings>;

    settingsExists: ApiMethodNoArgument<boolean>;

    toggleBrowserWindow: ApiMethod<{ forcedState?: boolean }, null>;

    toggleCompactLayout: ApiMethodNoArgument<Config>;

    updateOverlayIcon: ApiMethod<{ hasLoggedOut: boolean, unread: number }, null>;
}

export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: `${APP_NAME}:ipcMain-api`});
