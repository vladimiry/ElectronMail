import {Action} from "@ngrx/store";

import {IpcRendererActions} from "_shared/electron-actions";
import {AccountConfig} from "_shared/model/account";

export class AccountNotification implements Action {
    static readonly type = "account:account-notification";
    readonly type = AccountNotification.type;

    constructor(public accountConfig: AccountConfig, public payload: IpcRendererActions.Notification.O) {}
}
