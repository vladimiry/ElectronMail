import {Action} from "@ngrx/store";

import {WebAccountProgress} from "_@shared/model/account";

export class PatchAccountProgress implements Action {
    static readonly type = "account:patch-account-progress";
    readonly type = PatchAccountProgress.type;

    constructor(public login: string, public patch: WebAccountProgress) {}
}
