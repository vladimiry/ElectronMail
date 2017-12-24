import {Action} from "@ngrx/store";

import {IpcRendererActions} from "_shared/electron-actions";
import {WebAccount} from "_shared/model/account";

export class AccountNotification implements Action {
    static readonly type = "account:account-notification";
    readonly type = AccountNotification.type;

    constructor(public account: WebAccount, public payload: IpcRendererActions.Notification.O) {}
}
