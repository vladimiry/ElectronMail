import {Action} from "@ngrx/store";

import {AccountConfig} from "_shared/model/account";

export class SyncAccountsConfigs implements Action {
    static readonly type = "account:sync-accounts-configs";
    readonly type = SyncAccountsConfigs.type;

    constructor(public accountConfigs: AccountConfig[]) {}
}
