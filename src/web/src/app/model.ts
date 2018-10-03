import {
    AccountConfig,
    AccountConfigProtonmail,
    AccountConfigTutanota,
    Notifications,
    NotificationsProtonmail,
    NotificationsTutanota,
} from "src/shared/model/account";

interface GenericWebAccount<C extends AccountConfig, NS extends Notifications> {
    accountConfig: C;
    progress: Partial<Record<keyof C["credentials"], boolean>> & Partial<{ syncing: boolean }>;
    notifications: NS;
    syncingActivated?: boolean;
    databaseView?: boolean;
}

export type WebAccountProtonmail = GenericWebAccount<AccountConfigProtonmail, NotificationsProtonmail>;

export type WebAccountTutanota = GenericWebAccount<AccountConfigTutanota, NotificationsTutanota>;

export type WebAccount = WebAccountProtonmail | WebAccountTutanota;

export type WebAccountProgress = WebAccount["progress"];
