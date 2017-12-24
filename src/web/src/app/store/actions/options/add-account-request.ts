import {Action} from "@ngrx/store";

import {AccountConfigPatch} from "_shared/model/container";

export class AddAccountRequest implements Action {
    static readonly type = "options:add-account-request";
    readonly type = AddAccountRequest.type;

    constructor(public payload: AccountConfigPatch) {}
}
