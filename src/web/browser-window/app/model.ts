import {AccountConfig, Notifications} from "src/shared/model/account";

export interface WebAccount {
    accountConfig: AccountConfig;
    progress: Partial<Record<keyof AccountConfig["credentials"], boolean>> & Partial<{
        syncing: boolean;
        indexing: boolean;
        searching: boolean;
        selectingMailOnline: boolean;
        deletingMessages: boolean;
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
    webviewSrcValues: Record<Extract<keyof typeof __METADATA__.electronLocations.preload, "primary" | "calendar">, string>;
}

export type WebAccountProgress = WebAccount["progress"];
