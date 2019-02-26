// tslint:disable:no-unused-variable // TODO figure why tslint detects some imports as unused

import {ApiMethod, ApiMethodNoArgument, IpcMainApiService} from "electron-rpc-api";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {UnionOf, ofType, unionize} from "@vladimiry/unionize";

import * as DbModel from "src/shared/model/database";
import {APP_NAME} from "src/shared/constants";
import {
    AccountConfigCreatePatch,
    AccountConfigUpdatePatch,
    LoginFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {DbPatch} from "./common";
import {ElectronContextLocations} from "src/shared/model/electron";
import {Omit} from "src/shared/types";

export interface Endpoints {
    addAccount: ApiMethod<AccountConfigCreatePatch, Settings>;

    updateAccount: ApiMethod<AccountConfigUpdatePatch, Settings>;

    changeAccountOrder: ApiMethod<LoginFieldContainer & { index: number }, Settings>;

    removeAccount: ApiMethod<LoginFieldContainer, Settings>;

    changeMasterPassword: ApiMethod<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;

    dbPatch: ApiMethod<DbModel.DbAccountPk
        & { patch: DbPatch }
        & { forceFlush?: boolean }
        & { metadata: Omit<DbModel.MemoryDbAccount["metadata"], "type"> },
        DbModel.FsDbAccount["metadata"]>;

    dbGetAccountMetadata: ApiMethod<DbModel.DbAccountPk, DbModel.FsDbAccount["metadata"] | null>;

    dbGetAccountDataView: ApiMethod<DbModel.DbAccountPk,
        {
            folders: {
                system: DbModel.View.Folder[];
                custom: DbModel.View.Folder[];
            };
            contacts: DbModel.DbFsDataContainer["contacts"];
        } | undefined>;

    dbGetAccountMail: ApiMethod<DbModel.DbAccountPk & { pk: DbModel.Mail["pk"] }, DbModel.Mail>;

    dbExport: ApiMethod<DbModel.DbAccountPk & { mailPks?: Array<DbModel.Mail["pk"]> },
        { count: number; } | { progress: number; file: string; }>;

    dbSearchRootConversationNodes:
        ApiMethod<DbModel.DbAccountPk
            & { folderPks?: Array<DbModel.Folder["pk"]> }
            & ({ query: string } | { mailPks: Array<DbModel.Folder["pk"]> }),
            DbModel.View.RootConversationNode[]>;

    dbFullTextSearch
        : ApiMethod<DbModel.DbAccountPk & { query: string; folderPks?: Array<DbModel.Folder["pk"]>; },
        {
            uid: string;
            mailsBundleItems: Array<{ mail: DbModel.View.Mail & { score: number; }; conversationSize: number; }>;
        } & Pick<ReturnType<DbModel.MailsIndex["search"]>, "expandedTerms">>;

    dbIndexerOn: ApiMethod<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>, null>;

    dbIndexerNotification: ApiMethodNoArgument<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS>>;

    init: ApiMethodNoArgument<{
        electronLocations: ElectronContextLocations;
        hasSavedPassword?: boolean;
        snapPasswordManagerServiceHint?: boolean;
        keytarSupport: boolean;
    }>;

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

    loadDatabase: ApiMethod<Pick<Settings, "accounts">, null>;

    activateBrowserWindow: ApiMethodNoArgument<null>;

    toggleBrowserWindow: ApiMethod<{ forcedState?: boolean }, null>;

    toggleCompactLayout: ApiMethodNoArgument<Config>;

    updateOverlayIcon: ApiMethod<{ hasLoggedOut: boolean, unread: number; unreadBgColor?: string; unreadTextColor?: string; }, null>;

    hotkey: ApiMethod<{ type: "copy" | "paste" | "selectAll" }, null>;

    findInPageDisplay: ApiMethod<{ visible: boolean; }, null>;

    findInPage: ApiMethod<{ query: string; options?: Electron.FindInPageOptions; }, Pick<Electron.FoundInPageResult, "requestId"> | null>;

    findInPageStop: ApiMethodNoArgument<null>;

    findInPageNotification: ApiMethodNoArgument<Electron.FoundInPageResult | { requestId: null }>;

    selectAccount: ApiMethod<{ databaseView?: boolean; reset?: boolean }, null>;

    notification: ApiMethodNoArgument<UnionOf<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS>>;
}

export const IPC_MAIN_API = new IpcMainApiService<Endpoints>({channel: `${APP_NAME}:ipcMain-api`});

export const IPC_MAIN_API_DB_INDEXER_ON_ACTIONS = unionize({
        Bootstrapped: ofType<{}>(),
        ProgressState: ofType<{
            key: DbModel.DbAccountPk;
            status: {
                indexing?: boolean;
                searching?: boolean;
            };
        } | {
            status: {
                indexing?: boolean;
            };
        }>(),
        IndexingResult: ofType<{
            uid: string;
        }>(),
        SearchResult: ofType<{
            data: ReturnType<DbModel.MailsIndex["search"]>;
            uid: string;
        }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_db_indexer_on:",
    },
);

export const IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS = unionize({
        Bootstrap: ofType<{}>(),
        // TODO consider splitting huge data portion to chunks, see "ramda.splitEvery"
        Index: ofType<{
            key: DbModel.DbAccountPk;
            remove: Array<Pick<DbModel.IndexableMail, "pk">>;
            add: DbModel.IndexableMail[];
            uid: string;
        }>(),
        Search: ofType<{
            key: DbModel.DbAccountPk;
            query: string;
            uid: string;
        }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_db_indexer_notification_actions:",
    },
);

// WARN: do not put sensitive data or any data to the main process notification stream, only status-like signals
export const IPC_MAIN_API_NOTIFICATION_ACTIONS = unionize({
        Bootstrap: ofType<{}>(),
        ActivateBrowserWindow: ofType<{}>(),
        TargetUrl: ofType<{ url: string }>(),
        DbPatchAccount: ofType<{
            key: DbModel.DbAccountPk;
            entitiesModified: boolean;
            metadataModified: boolean;
            stat: { mails: number, folders: number; contacts: number; unread: number; };
        }>(),
        DbIndexerProgressState: ofType<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>, { type: "ProgressState" }>["payload"]>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_notification:",
    },
);
