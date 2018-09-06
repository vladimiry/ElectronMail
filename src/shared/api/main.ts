import {ApiMethod, ApiMethodNoArgument, IpcMainApiService} from "electron-rpc-api";
// tslint:disable-next-line:no-unused-variable // TODO figure why tslint detects below import as unused
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {UnionOf, ofType, unionize} from "unionize";

import * as DbModel from "src/shared/model/database";
import {APP_NAME} from "src/shared/constants";
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
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {BatchEntityUpdatesDbPatch} from "./common";
// tslint:disable-next-line:no-unused-variable // TODO figure why tslint detects below import as unused
import {ElectronContextLocations} from "src/shared/model/electron";

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;

    updateAccount: ApiMethod<AccountConfigUpdatePatch, Settings>;

    changeAccountOrder: ApiMethod<LoginFieldContainer & { index: number }, Settings>;

    removeAccount: ApiMethod<LoginFieldContainer, Settings>;

    associateSettingsWithKeePass: ApiMethod<UrlFieldContainer, Settings>;

    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;

    dbPatch: ApiMethod<{ type: keyof DbModel.FsDb, login: string } & BatchEntityUpdatesDbPatch
        & { forceFlush?: boolean } & { metadata: Partial<DbModel.FsDbAccount["metadata"]> }, DbModel.FsDbAccount["metadata"]>;

    dbGetAccountMetadata: ApiMethod<{ type: keyof DbModel.FsDb, login: string }, DbModel.FsDbAccount["metadata"] | null>;

    dbGetAccountDataView: ApiMethod<{ type: keyof DbModel.FsDb, login: string },
        {
            folders: DbModel.FolderWithMailsReference[];
            contacts: DbModel.DbEntitiesRecordContainer["contacts"];
        }>;

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

    reEncryptSettings: ApiMethod<PasswordFieldContainer & { encryptionPreset: PasswordBasedPreset }, Settings>;

    settingsExists: ApiMethodNoArgument<boolean>;

    activateBrowserWindow: ApiMethodNoArgument<null>;

    toggleBrowserWindow: ApiMethod<{ forcedState?: boolean }, null>;

    toggleCompactLayout: ApiMethodNoArgument<Config>;

    updateOverlayIcon: ApiMethod<{ hasLoggedOut: boolean, unread: number }, null>;

    notification: ApiMethodNoArgument<UnionOf<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS>>;
}

export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: `${APP_NAME}:ipcMain-api`});

// WARN: do not put sensitive data into the main process notification stream
export const IPC_MAIN_API_NOTIFICATION_ACTIONS = unionize({
        ActivateBrowserWindow: ofType<{}>(),
        DbPatchAccount: ofType<{
            key: { type: keyof DbModel.FsDb, login: string };
            stat: { mails: number, folders: number; contacts: number };
        }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_notification:",
    },
);
