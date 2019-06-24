import {ActionType, ScanService, createIpcMainApiService} from "electron-rpc-api";
import {BrowserWindow} from "electron";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {UnionOf, ofType, unionize} from "@vladimiry/unionize";

import * as DbModel from "src/shared/model/database";
import {
    AccountConfigCreatePatch,
    AccountConfigUpdatePatch,
    LoginFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {Controller, FuzzyLocale} from "src/electron-main/spell-check/model";
import {DbPatch} from "./common";
import {ElectronContextLocations} from "src/shared/model/electron";
import {FsDbAccount} from "src/shared/model/database";
import {PACKAGE_NAME} from "src/shared/constants";

export type IpcMainServiceScan = ScanService<typeof IPC_MAIN_API>;

export type IpcMainApiEndpoints = IpcMainServiceScan["ApiClient"];

export const ENDPOINTS_DEFINITION = {
    getSpellCheckMetadata: ActionType.Promise<void, { locale: ReturnType<Controller["getCurrentLocale"]> }>(),

    changeSpellCheckLocale: ActionType.Promise<{ locale: FuzzyLocale }>(),

    spellCheck: ActionType.Promise<{ words: string[] }, { misspelledWords: string[] }>(),

    addAccount: ActionType.Promise<AccountConfigCreatePatch, Settings>(),

    updateAccount: ActionType.Promise<AccountConfigUpdatePatch, Settings>(),

    changeAccountOrder: ActionType.Promise<LoginFieldContainer & { index: number }, Settings>(),

    removeAccount: ActionType.Promise<LoginFieldContainer, Settings>(),

    changeMasterPassword: ActionType.Promise<PasswordFieldContainer & NewPasswordFieldContainer, Settings>(),

    dbPatch: ActionType.Promise<DbModel.DbAccountPk
        & { forceFlush?: boolean }
        & { patch: DbPatch }
        & { metadata: Omit<FsDbAccount<"protonmail">["metadata"], "type"> | Omit<FsDbAccount<"tutanota">["metadata"], "type"> },
        DbModel.FsDbAccount["metadata"]>(),

    dbGetAccountMetadata: ActionType.Promise<DbModel.DbAccountPk, DbModel.FsDbAccount["metadata"] | null>(),

    dbGetAccountDataView: ActionType.Promise<DbModel.DbAccountPk,
        {
            folders: {
                system: DbModel.View.Folder[];
                custom: DbModel.View.Folder[];
            };
        } | undefined>(),

    dbGetAccountMail: ActionType.Promise<DbModel.DbAccountPk & { pk: DbModel.Mail["pk"] }, DbModel.Mail>(),

    dbExport: ActionType.Observable<DbModel.DbAccountPk & { mailPks?: Array<DbModel.Mail["pk"]> },
        { count: number; } | { progress: number; file: string; }>(),

    dbSearchRootConversationNodes:
        ActionType.Promise<DbModel.DbAccountPk
            & { folderPks?: Array<DbModel.Folder["pk"]> }
            & ({ query: string } | { mailPks: Array<DbModel.Folder["pk"]> }),
            DbModel.View.RootConversationNode[]>(),

    dbFullTextSearch: ActionType.Promise<DbModel.DbAccountPk & { query: string; folderPks?: Array<DbModel.Folder["pk"]>; },
        {
            uid: string;
            mailsBundleItems: Array<{ mail: DbModel.View.Mail & { score: number; }; conversationSize: number; }>;
        } & Pick<ReturnType<DbModel.MailsIndex["search"]>, "expandedTerms">>(),

    dbIndexerOn: ActionType.Promise<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>>(),

    dbIndexerNotification: ActionType.Observable<void, UnionOf<typeof IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS>>(),

    init: ActionType.Promise<void, InitResponse>(),

    logout: ActionType.Promise(),

    openAboutWindow: ActionType.Promise(),

    openExternal: ActionType.Promise<{ url: string }>(),

    openSettingsFolder: ActionType.Promise(),

    patchBaseConfig: ActionType.Promise<BaseConfig, Config>(),

    quit: ActionType.Promise(),

    readConfig: ActionType.Promise<void, Config>(),

    readSettings: ActionType.Promise<Partial<PasswordFieldContainer> & { savePassword?: boolean; }, Settings>(),

    reEncryptSettings: ActionType.Promise<PasswordFieldContainer & { encryptionPreset: PasswordBasedPreset }, Settings>(),

    settingsExists: ActionType.Promise<void, boolean>(),

    loadDatabase: ActionType.Promise<Pick<Settings, "accounts">>(),

    activateBrowserWindow: ActionType.Promise<BrowserWindow | void>(),

    toggleBrowserWindow: ActionType.Promise<{ forcedState: boolean } | void>(),

    toggleCompactLayout: ActionType.Promise<void, Config>(),

    updateOverlayIcon: ActionType.Promise<{ hasLoggedOut: boolean, unread: number; unreadBgColor?: string; unreadTextColor?: string; }>(),

    hotkey: ActionType.Promise<{ type: "copy" | "paste" | "selectAll" }>(),

    findInPageDisplay: ActionType.Promise<{ visible: boolean; }>(),

    findInPage: ActionType.Promise<{ query: string; options?: Electron.FindInPageOptions; },
        Pick<Electron.FoundInPageResult, "requestId"> | null>(),

    findInPageStop: ActionType.Promise(),

    findInPageNotification: ActionType.Observable<void, Electron.FoundInPageResult | { requestId: null }>(),

    selectAccount: ActionType.Promise<{ databaseView?: boolean; reset?: boolean }>(),

    updateCheck: ActionType.Promise<void, Array<{ title: string; url?: string; date: string; }>>(),

    toggleControls: ActionType.Promise<Pick<Required<Config>, "hideControls"> | void, void>(),

    notification: ActionType.Observable<void, UnionOf<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS>>(),
};

export interface InitResponse {
    electronLocations: ElectronContextLocations;
    hasSavedPassword?: boolean;
    snapPasswordManagerServiceHint?: boolean;
    keytarSupport: boolean;
    checkUpdateAndNotify: boolean;
}

export const IPC_MAIN_API = createIpcMainApiService({
    channel: `${PACKAGE_NAME}:ipcMain-api`,
    apiDefinition: ENDPOINTS_DEFINITION,
});

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
        Locale: ofType<{ locale: ReturnType<Controller["getCurrentLocale"]> }>(),
        ConfigUpdated: ofType<Config>(),
        OpenOptions: ofType<{}>(),
        LogOut: ofType<{}>(),
        SignedInStateChange: ofType<{ signedIn: boolean }>(),
        ErrorMessage: ofType<{ message: string }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_notification:",
    },
);
