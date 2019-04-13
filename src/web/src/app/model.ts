import {
    AccountConfig,
    AccountConfigProtonmail,
    AccountConfigTutanota,
    AccountType,
    Notifications,
    NotificationsProtonmail,
    NotificationsTutanota,
} from "src/shared/model/account";
import {Arguments, Omit} from "src/shared/types";
import {CommonWebViewApi} from "src/shared/api/webview/common";
import {ZoneApiParameter} from "src/shared/api/common";

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
    fetchSingleMailParams: Omit<Arguments<CommonWebViewApi<AccountType>["fetchSingleMail"]>[0], keyof ZoneApiParameter> | null;
}

export type WebAccountProtonmail = GenericWebAccount<AccountConfigProtonmail, NotificationsProtonmail>;

export type WebAccountTutanota = GenericWebAccount<AccountConfigTutanota, NotificationsTutanota>;

export type WebAccount = WebAccountProtonmail | WebAccountTutanota;

export type WebAccountProgress = WebAccount["progress"];
