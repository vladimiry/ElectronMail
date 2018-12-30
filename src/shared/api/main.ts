// tslint:disable:no-unused-variable // TODO figure why tslint detects some imports as unused

import {ApiMethod, ApiMethodNoArgument, IpcMainApiService} from "electron-rpc-api";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {UnionOf, ofType, unionize} from "@vladimiry/unionize";

import * as DatabaseModel from "src/shared/model/database";
import {APP_NAME} from "src/shared/constants";
import {
    AccountConfigCreatePatch,
    AccountConfigUpdatePatch,
    LoginFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {DbAccountPk, DbEntitiesRecordContainer, FsDbAccount, MemoryDbAccount} from "src/shared/model/database";
import {DbPatch} from "./common";
import {ElectronContextLocations} from "src/shared/model/electron";
import {Omit} from "src/shared/types";

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;

    updateAccount: ApiMethod<AccountConfigUpdatePatch, Settings>;

    changeAccountOrder: ApiMethod<LoginFieldContainer & { index: number }, Settings>;

    removeAccount: ApiMethod<LoginFieldContainer, Settings>;

    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;

    dbPatch: ApiMethod<DbAccountPk
        & { patch: DbPatch }
        & { forceFlush?: boolean }
        & { metadata: Omit<MemoryDbAccount["metadata"], "type"> },
        FsDbAccount["metadata"]>;

    dbGetAccountMetadata: ApiMethod<DbAccountPk, FsDbAccount["metadata"] | null>;

    dbGetAccountDataView: ApiMethod<DbAccountPk,
        {
            folders: {
                system: DatabaseModel.View.Folder[];
                custom: DatabaseModel.View.Folder[];
            };
            contacts: DbEntitiesRecordContainer["contacts"];
        } | undefined>;

    dbGetAccountMail: ApiMethod<DbAccountPk & { pk: DatabaseModel.Mail["pk"] }, DatabaseModel.Mail>;

    dbExport: ApiMethod<DbAccountPk, { count: number; } | { progress: number; file: string; }>;

    init: ApiMethodNoArgument<{ electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>;

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

    hotkey: ApiMethod<{ type: "copy" | "paste" }, null>;

    findInPageDisplay: ApiMethod<{ visible: boolean; }, null>;

    findInPage: ApiMethod<{ query: string; options?: Electron.FindInPageOptions; }, Pick<Electron.FoundInPageResult, "requestId"> | null>;

    findInPageStop: ApiMethodNoArgument<null>;

    findInPageNotification: ApiMethodNoArgument<Electron.FoundInPageResult | { requestId: null }>;

    selectAccount: ApiMethod<{ databaseView?: boolean; reset?: boolean }, null>;

    notification: ApiMethodNoArgument<UnionOf<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS>>;
}

export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: `${APP_NAME}:ipcMain-api`});

// WARN: do not put sensitive data into the main process notification stream
export const IPC_MAIN_API_NOTIFICATION_ACTIONS = unionize({
        ActivateBrowserWindow: ofType<{}>(),
        DbPatchAccount: ofType<{
            key: DbAccountPk;
            entitiesModified: boolean;
            metadataModified: boolean;
            stat: { mails: number, folders: number; contacts: number; unread: number; };
        }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_notification:",
    },
);
