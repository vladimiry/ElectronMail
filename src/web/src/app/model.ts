import {Observable} from "rxjs";

import {
    AccountConfig,
    AccountConfigProtonmail,
    AccountConfigTutanota,
    Notifications,
    NotificationsProtonmail,
    NotificationsTutanota,
} from "src/shared/model/account";
import {FetchMessagesOutput} from "src/shared/api/webview/common";

interface GenericWebAccount<C extends AccountConfig, NS extends Notifications> {
    accountConfig: C;
    progress: Partial<Record<keyof C["credentials"], boolean>>;
    notifications: NS;
    fetching$?: Observable<FetchMessagesOutput>;
}

export type WebAccountProtonmail = GenericWebAccount<AccountConfigProtonmail, NotificationsProtonmail>;

export type WebAccountTutanota = GenericWebAccount<AccountConfigTutanota, NotificationsTutanota>;

export type WebAccount = WebAccountProtonmail | WebAccountTutanota;

export type WebAccountProgress = WebAccount["progress"];
