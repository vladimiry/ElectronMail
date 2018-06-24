import {Action} from "@ngrx/store";

import {WebAccount} from "_@shared/model/account";

export class DestroyAccount implements Action {
    static readonly type = "account:destroy-account";
    readonly type = DestroyAccount.type;

    constructor(public account: WebAccount) {}
}
