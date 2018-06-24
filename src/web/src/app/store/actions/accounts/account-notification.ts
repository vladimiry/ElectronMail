import {Action} from "@ngrx/store";

import {AccountConfig} from "_@shared/model/account";
import {AccountNotificationOutput} from "_@shared/api/webview/notification-output";

export class AccountNotification implements Action {
    static readonly type = "account:account-notification";
    readonly type = AccountNotification.type;

    constructor(public accountConfig: AccountConfig, public notification: AccountNotificationOutput) {}
}
