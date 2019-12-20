import {
    AccountConfig,
    AccountConfigTutanota,
    Notifications,
    NotificationsTutanota,
} from "src/shared/model/account";
import {Mail} from "src/shared/model/database";
import {MailsBundleKey} from "src/web/browser-window/app/store/reducers/db-view";

interface GenericWebAccount<C extends AccountConfig, NS extends Notifications> {
    accountConfig: C;
    progress: Partial<Record<keyof C["credentials"], boolean>> & Partial<{
        syncing: boolean;
        indexing: boolean;
        searching: boolean;
        selectingMailOnline: boolean;
    }>;
    notifications: NS;
    syncingActivated?: boolean;
    databaseView?: boolean;
    loginFilledOnce?: boolean;
    loggedInOnce?: boolean;
    loginDelayedSeconds?: number;
    loginDelayedUntilSelected?: boolean;
    // TODO consider combining "fetchSingleMailParams" and "makeReadMailParams" to the object with "optional" props
    fetchSingleMailParams: { mailPk: Mail["pk"] } | null;
    makeReadMailParams: { messageIds: string[]; mailsBundleKey: MailsBundleKey; } | null;
}

export type WebAccountTutanota = GenericWebAccount<AccountConfigTutanota, NotificationsTutanota>;

export type WebAccount = WebAccountTutanota;

export type WebAccountProgress = WebAccount["progress"];
