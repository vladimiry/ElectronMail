// tslint:disable:no-unused-variable // TODO figure why tslint detects some imports as unused

import {ApiMethod, ApiMethodNoArgument, IpcMainApiService} from "electron-rpc-api";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {UnionOf, ofType, unionize} from "@vladimiry/unionize";

import * as DatabaseModel from "src/shared/model/database";
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
import {AccountType} from "src/shared/model/account";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {CommonWebViewApi} from "./webview/common";
import {DbAccountPk, DbEntitiesRecordContainer, FsDbAccount} from "src/shared/model/database";
import {DbPatch} from "./common";
import {ElectronContextLocations} from "src/shared/model/electron";
import {Unpacked} from "src/shared/types";

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;

    updateAccount: ApiMethod<AccountConfigUpdatePatch, Settings>;

    changeAccountOrder: ApiMethod<LoginFieldContainer & { index: number }, Settings>;

    removeAccount: ApiMethod<LoginFieldContainer, Settings>;

    associateSettingsWithKeePass: ApiMethod<UrlFieldContainer, Settings>;

    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;

    dbPatch: ApiMethod<DbAccountPk
        & { patch: DbPatch }
        & { forceFlush?: boolean }
        & { metadata: Unpacked<ReturnType<CommonWebViewApi<AccountType>["buildDbPatch"]>>["metadata"] },
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

    hotkey: ApiMethod<{ type: "copy" | "paste" }, null>;

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
