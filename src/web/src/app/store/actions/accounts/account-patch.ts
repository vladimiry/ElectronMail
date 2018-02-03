import {Action} from "@ngrx/store";

import {WebAccount} from "_shared/model/account";

export class AccountPatch implements Action {
    static readonly type = "account:account-patch";
    readonly type = AccountPatch.type;

    constructor(public login: string, public patch: Partial<WebAccount>) {}
}
