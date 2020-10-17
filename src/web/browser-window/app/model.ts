import {AccountConfig, Notifications} from "src/shared/model/account";

export interface WebAccount {
    accountConfig: AccountConfig;
    progress: Partial<Record<keyof AccountConfig["credentials"], boolean>> & Partial<{
        syncing: boolean;
        indexing: boolean;
        searching: boolean;
        selectingMailOnline: boolean;
        makingMailRead: boolean;
        settingMailFolder: boolean;
        fetchingSingleMail: boolean;
    }>;
    dbExportProgress: Array<{ uuid: string; progress: number }>;
    notifications: Notifications;
    syncingActivated?: boolean;
    databaseView?: boolean;
    loginFilledOnce?: boolean;
    loggedInOnce?: boolean;
    loginDelayedSeconds?: number;
    loginDelayedUntilSelected?: boolean;
}

export type WebAccountProgress = WebAccount["progress"];
