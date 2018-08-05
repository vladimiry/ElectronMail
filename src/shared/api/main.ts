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
// tslint:disable-next-line:no-unused-variable
import {APP_NAME} from "src/shared/constants";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {EntityRecord, EntityTable} from "src/shared/model/database";
// TODO figure why tslint detects "ElectronContextLocations" as unused
// tslint:disable-next-line:no-unused-variable
import {ElectronContextLocations} from "src/shared/model/electron";
// TODO figure why tslint detects "Omit" as unused
// tslint:disable-next-line:no-unused-variable
import {Omit} from "src/shared/types";
// TODO figure why tslint detects "AccountType" as unused
// tslint:disable-next-line:no-unused-variable
import {AccountType} from "src/shared/model/account";

export interface DatabaseUpsertInput<T extends EntityTable = EntityTable,
    E extends InstanceType<EntityRecord[T]> = InstanceType<EntityRecord[T]>> {
    table: T;
    data: Array<Omit<E, "pk">>;
}

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;
    updateAccount: ApiMethod<AccountConfigUpdatePatch, Settings>;
    changeAccountOrder: ApiMethod<LoginFieldContainer & { index: number }, Settings>;
    removeAccount: ApiMethod<LoginFieldContainer, Settings>;

    associateSettingsWithKeePass: ApiMethod<UrlFieldContainer, Settings>;

    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;

    databaseUpsert: ApiMethod<DatabaseUpsertInput, never>;
    databaseMailRawNewestTimestamp: ApiMethod<{ type: AccountType, login: string }, { value?: string }>;

    init: ApiMethodNoArgument<{ electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>;

    keePassRecordRequest: ApiMethod<KeePassRefFieldContainer & KeePassClientConfFieldContainer
        & { suppressErrors: boolean }, Partial<PasswordFieldContainer & MessageFieldContainer>>;

    logout: ApiMethodNoArgument<never>;

    openAboutWindow: ApiMethodNoArgument<never>;

    openExternal: ApiMethod<{ url: string }, never>;

    openSettingsFolder: ApiMethodNoArgument<never>;

    patchBaseConfig: ApiMethod<BaseConfig, Config>;

    quit: ApiMethodNoArgument<never>;

    readConfig: ApiMethodNoArgument<Config>;

    readSettings: ApiMethod<Partial<PasswordFieldContainer> & { savePassword?: boolean; }, Settings>;

    reEncryptSettings: ApiMethod<PasswordFieldContainer & { encryptionPreset: EncryptionAdapterOptions }, Settings>;

    settingsExists: ApiMethodNoArgument<boolean>;

    toggleBrowserWindow: ApiMethod<{ forcedState?: boolean }, never>;

    toggleCompactLayout: ApiMethodNoArgument<Config>;

    updateOverlayIcon: ApiMethod<{ hasLoggedOut: boolean, unread: number }, never>;
}

export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: `${APP_NAME}:ipcMain-api`});
