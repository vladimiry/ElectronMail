import {AccountConfig, Notifications} from "src/shared/model/account";
import {Folder, Mail} from "src/shared/model/database";

export interface WebAccount {
    accountConfig: AccountConfig;
    progress: Partial<Record<keyof AccountConfig["credentials"], boolean>> & Partial<{
        syncing: boolean;
        indexing: boolean;
        searching: boolean;
        selectingMailOnline: boolean;
    }>;
    dbExportProgress: Array<{ uuid: string; progress: number }>;
    notifications: Notifications;
    syncingActivated?: boolean;
    databaseView?: boolean;
    loginFilledOnce?: boolean;
    loggedInOnce?: boolean;
    loginDelayedSeconds?: number;
    loginDelayedUntilSelected?: boolean;
    // TODO consider combining "fetchSingleMailParams" and "makeReadMailParams" to the object with "optional" props
    fetchSingleMailParams: { mailPk: Mail["pk"] } | null;
    makeReadMailParams: { messageIds: Array<Mail["id"]> } | null;
    setMailFolderParams: { folderId: Folder["id"]; messageIds: Array<Mail["id"]> } | null;
}

export type WebAccountProgress = WebAccount["progress"];
