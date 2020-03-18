import {AccountConfig, Notifications} from "src/shared/model/account";
import {Mail} from "src/shared/model/database";
import {MailsBundleKey} from "src/web/browser-window/app/store/reducers/db-view";

export interface WebAccount {
    accountConfig: AccountConfig;
    progress: Partial<Record<keyof AccountConfig["credentials"], boolean>> & Partial<{
        syncing: boolean;
        indexing: boolean;
        searching: boolean;
        selectingMailOnline: boolean;
    }>;
    notifications: Notifications;
    syncingActivated?: boolean;
    databaseView?: boolean;
    loginFilledOnce?: boolean;
    loggedInOnce?: boolean;
    loginDelayedSeconds?: number;
    loginDelayedUntilSelected?: boolean;
    // TODO consider combining "fetchSingleMailParams" and "makeReadMailParams" to the object with "optional" props
    fetchSingleMailParams: { mailPk: Mail["pk"] } | null;
    makeReadMailParams: { messageIds: string[]; mailsBundleKey: MailsBundleKey } | null;
}

export type WebAccountProgress = WebAccount["progress"];
