import {Action} from "@ngrx/store";

import {AccountConfigPatch} from "_@shared/model/container";

export class UpdateAccountRequest implements Action {
    static readonly type = "options:update-account-request";
    readonly type = UpdateAccountRequest.type;

    constructor(public payload: AccountConfigPatch) {}
}
