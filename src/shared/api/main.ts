import {ActionType, ScanService, createIpcMainApiService} from "electron-rpc-api";
import {BrowserWindow} from "electron";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {UnionOf, ofType, unionize} from "@vladimiry/unionize";

import * as DbModel from "src/shared/model/database";
import {
    AccountConfigCreateUpdatePatch,
    ApiEndpointOriginFieldContainer,
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
import {ProtonAttachmentHeadersProp, ProtonClientSession} from "src/shared/model/proton";

export const IPC_MAIN_API_DB_INDEXER_ON_ACTIONS = unionize({
        Bootstrapped: ofType<Record<string, unknown>>(),
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
        ErrorMessage: ofType<{ message: string }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_db_indexer_on:",
    },
);

export const IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS = unionize({
        Bootstrap: ofType<Record<string, unknown>>(),
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
        Bootstrap: ofType<Record<string, unknown>>(),
        ActivateBrowserWindow: ofType<Record<string, unknown>>(),
        TargetUrl: ofType<DeepReadonly<NoExtraProps<{
            url: string;
            // percent sizes get calculated since absolute sizes use introduce a mistake if "zoomFactor is not 1"
            position?: { cursorXPercent: number; cursorYPercent: number };
        }>>>(),
        DbPatchAccount: ofType<{
            key: DbModel.DbAccountPk;
            entitiesModified: boolean;
            metadataModified: boolean;
            stat: { mails: number; folders: number; contacts: number; unread: number };
        }>(),
        DbIndexerProgressState: ofType<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>, { type: "ProgressState" }>["payload"]>(),
        DbAttachmentExportRequest: ofType<DeepReadonly<{
            uuid: string;
            key: DbModel.DbAccountPk;
            mailPk: DbModel.Mail["pk"];
            timeoutMs: number;
        }>>(),
        Locale: ofType<{ locale: ReturnType<Controller["getCurrentLocale"]> }>(),
        ConfigUpdated: ofType<Config>(),
        OpenOptions: ofType<Record<string, unknown>>(),
        LogOut: ofType<Record<string, unknown>>(),
        SignedInStateChange: ofType<{ signedIn: boolean }>(),
        ErrorMessage: ofType<{ message: string }>(),
        InfoMessage: ofType<{ message: string }>(),
        TrayIconDataURL: ofType<string>(),
        PowerMonitor: ofType<{ message: "suspend" | "resume" | "shutdown" }>(),
        ProtonSessionTokenCookiesModified: ofType<{ key: DbModel.DbAccountPk }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "ipc_main_api_notification:",
    },
);

export const ENDPOINTS_DEFINITION = {
    getSpellCheckMetadata: ActionType.Promise<void, { locale: ReturnType<Controller["getCurrentLocale"]> }>(),

    changeSpellCheckLocale: ActionType.Promise<{ locale: FuzzyLocale }>(),

    spellCheck: ActionType.Promise<{ words: string[] }, { misspelledWords: string[] }>(),

    addAccount: ActionType.Promise<AccountConfigCreateUpdatePatch, Settings>(),

    updateAccount: ActionType.Promise<AccountConfigCreateUpdatePatch, Settings>(),

    changeAccountOrder: ActionType.Promise<LoginFieldContainer & { index: number }, Settings>(),

    toggleAccountDisabling: ActionType.Promise<LoginFieldContainer, Settings>(),

    removeAccount: ActionType.Promise<LoginFieldContainer, Settings>(),

    changeMasterPassword: ActionType.Promise<PasswordFieldContainer & NewPasswordFieldContainer, Settings>(),

    selectPath: ActionType.Observable<void, { message: "timeout-reset" | "canceled" } | { location: string }>(),

    dbPatch: ActionType.Promise<DbModel.DbAccountPk
        & { forceFlush?: boolean }
        & { patch: DbPatch }
        & { metadata: FsDbAccount["metadata"] },
        DbModel.FsDbAccount["metadata"]>(),

    dbGetAccountMetadata: ActionType.Promise<DbModel.DbAccountPk, DbModel.FsDbAccount["metadata"] | null>(),

    dbGetAccountDataView: ActionType.Promise<DbModel.DbAccountPk,
        {
            folders: {
                system: DbModel.View.Folder[];
                custom: DbModel.View.Folder[];
            };
        } | false>(),

    dbGetAccountMail: ActionType.Promise<DbModel.DbAccountPk & { pk: DbModel.Mail["pk"] }, DbModel.Mail>(),

    dbExport:
        ActionType.Observable<DeepReadonly<DbModel.DbAccountPk & {
            mailPks?: Array<DbModel.Mail["pk"]>;
            exportDir: string;
            includingAttachments?: boolean;
        }>, { mailsCount: number } | { progress: number; file: string; attachmentsLoadError: boolean }>(),

    dbExportMailAttachmentsNotification:
        ActionType.Promise<DeepReadonly<NoExtraProps<{
            uuid: string;
            accountPk: NoExtraProps<DbModel.DbAccountPk>;
            attachments: Array<NoExtraProps<ProtonAttachmentHeadersProp
                & ({ data: Uint8Array } | { serializedError: import("serialize-error").ErrorObject })>>;
            serializedError?: import("serialize-error").ErrorObject
        }>>>(),

    dbSearchRootConversationNodes:
        ActionType.Promise<DbModel.DbAccountPk
            & { folderIds?: Array<DbModel.Folder["id"]> }
            & ({ query: string } | { mailPks: Array<DbModel.Folder["pk"]> }),
            DbModel.View.RootConversationNode[]>(),

    dbFullTextSearch: ActionType.Promise<NoExtraProps<DbModel.DbAccountPk & {
        query: string;
        sentDateAfter: string;
        hasAttachments: boolean;
        folderIds?: Array<DbModel.Folder["pk"]>;
    }>, NoExtraProps<{
        searched: boolean;
        mailsBundleItems: Array<{ mail: DbModel.View.Mail & { score?: number }; conversationSize: number }>;
    }>>(),

    dbIndexerOn: ActionType.Promise<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>>(),

    dbIndexerNotification: ActionType.Observable<void, UnionOf<typeof IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS>>(),

    staticInit: ActionType.Promise<void, DeepReadonly<{
        electronLocations: ElectronContextLocations;
    }>>(),

    init: ActionType.Promise<void, InitResponse>(),

    logout: ActionType.Promise(),

    openAboutWindow: ActionType.Promise(),

    openExternal: ActionType.Promise<{ url: string }>(),

    openSettingsFolder: ActionType.Promise(),

    patchBaseConfig: ActionType.Promise<BaseConfig, Config>(),

    quit: ActionType.Promise(),

    readConfig: ActionType.Promise<void, Config>(),

    readSettings: ActionType.Promise<Partial<PasswordFieldContainer> & { savePassword?: boolean }, Settings>(),

    reEncryptSettings: ActionType.Promise<PasswordFieldContainer & { encryptionPreset: PasswordBasedPreset }, Settings>(),

    settingsExists: ActionType.Promise<void, boolean>(),

    loadDatabase: ActionType.Promise<Pick<Settings, "accounts">>(),

    activateBrowserWindow: ActionType.Promise<BrowserWindow | void>(),

    toggleBrowserWindow: ActionType.Promise<{ forcedState: boolean } | void>(),

    updateOverlayIcon: ActionType.Promise<{
        hasLoggedOut: boolean;
        unread: number;
        trayIconColor?: string;
        unreadBgColor?: string;
        unreadTextColor?: string;
    }>(),

    hotkey: ActionType.Promise<{ type: "copy" | "paste" | "selectAll" }>(),

    findInPageDisplay: ActionType.Promise<{ visible: boolean }>(),

    findInPage: ActionType.Promise<{ query: string; options?: Electron.FindInPageOptions },
        Pick<Electron.FoundInPageResult, "requestId"> | null>(),

    findInPageStop: ActionType.Promise(),

    findInPageNotification: ActionType.Observable<void, Electron.FoundInPageResult | { requestId: null }>(),

    selectAccount: ActionType.Promise<{ databaseView?: boolean; webContentId: number } | { reset: true }>(),

    updateCheck: ActionType.Promise<void, Array<{ title: string; url?: string; date: string }>>(),

    toggleControls: ActionType.Promise<Pick<Required<Config>, "hideControls"> | void, void>(),

    toggleLocalDbMailsListViewMode: ActionType.Promise<void, Config>(),

    generateTOTPToken: ActionType.Promise<{ secret: string }, { token: string }>(),

    resolveSavedProtonClientSession: ActionType.Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer,
        ProtonClientSession | null>(),

    saveProtonSession: ActionType.Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer
        & { clientSession: ProtonClientSession }>(),

    resetSavedProtonSession: ActionType.Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer>(),

    applySavedProtonBackendSession: ActionType.Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer, boolean>(),

    resetProtonBackendSession: ActionType.Promise<LoginFieldContainer>(),

    notification: ActionType.Observable<void, UnionOf<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS>>(),

    log: ActionType.Promise<{ level: import("src/shared/model/common").LogLevel, args: unknown[] }>(),
};

export interface InitResponse {
    hasSavedPassword?: boolean;
    snapPasswordManagerServiceHint?: boolean;
    keytarSupport: boolean;
    checkUpdateAndNotify: boolean;
}

export const IPC_MAIN_API = createIpcMainApiService({
    channel: `${PACKAGE_NAME}:ipcMain-api`,
    apiDefinition: ENDPOINTS_DEFINITION,
});

export type IpcMainServiceScan = ScanService<typeof IPC_MAIN_API>;

export type IpcMainApiEndpoints = IpcMainServiceScan["ApiClient"];
