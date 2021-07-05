import {ActionType, ScanService, createIpcMainApiService} from "electron-rpc-api";
import {BrowserWindow} from "electron";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";

import * as DbModel from "src/shared/model/database";
import {
    AccountConfigCreateUpdatePatch,
    ApiEndpointOriginFieldContainer,
    LoginFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
} from "src/shared/model/container";
import {AccountSessionStoragePatchBundle} from "src/shared/model/account";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {Controller, FuzzyLocale} from "src/electron-main/spell-check/model";
import {DbPatch} from "src/shared/api/common";
import {ElectronContextLocations} from "src/shared/model/electron";
import {FsDbAccount} from "src/shared/model/database";
import {
    IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS,
    IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS,
    IPC_MAIN_API_NOTIFICATION_ACTIONS
} from "src/shared/api/main-process/actions";
import {PACKAGE_NAME} from "src/shared/constants";
import {ProtonAttachmentHeadersProp, ProtonClientSession} from "src/shared/model/proton";
import {UnionOf} from "src/shared/ngrx-util";

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
        & { bootstrapPhase?: "initial" | "intermediate" | "final" }
        & { patch: DbPatch }
        & { metadata: FsDbAccount["metadata"] },
        DbModel.FsDbAccount["metadata"]>(),

    dbResetDbMetadata: ActionType.Promise<{ reset: boolean }>(),

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
            fileType: "eml" | "json";
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
        codeFilter?: string;
    }>, NoExtraProps<{
        searched: boolean;
        mailsBundleItems: Array<{ mail: DbModel.View.Mail & { score?: number }; conversationSize: number }>;
    }>>(),

    dbIndexerOn: ActionType.Promise<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS>>(),

    dbIndexerNotification: ActionType.Observable<void, UnionOf<typeof IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS>>(),

    staticInit: ActionType.Promise<void, {
        electronLocations: ElectronContextLocations
        monacoEditorExtraLibArgs: Record<"system" | "protonMessage",
            Parameters<typeof import("monaco-editor")["languages"]["typescript"]["typescriptDefaults"]["addExtraLib"]>>
    }>(),

    init: ActionType.Promise<void, InitResponse>(),

    logout: ActionType.Promise<{ skipKeytarProcessing?: boolean }>(),

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

    resolveSavedProtonClientSession: ActionType
        .Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer, ProtonClientSession | null>(),

    saveProtonSession: ActionType
        .Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer & { clientSession: ProtonClientSession }>(),

    resetSavedProtonSession: ActionType.Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer>(),

    applySavedProtonBackendSession: ActionType.Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer, boolean>(),

    resetProtonBackendSession: ActionType.Promise<LoginFieldContainer>(),

    saveSessionStoragePatch: ActionType
        .Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer & { sessionStorageItem: { __cookieStore__: string } }>(),

    resolvedSavedSessionStoragePatch: ActionType
        .Promise<LoginFieldContainer & ApiEndpointOriginFieldContainer,
            DeepReadonly<import("ts-essentials").ValueOf<AccountSessionStoragePatchBundle>> | undefined | null>(),

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
