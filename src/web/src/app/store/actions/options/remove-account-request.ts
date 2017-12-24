import {Action} from "@ngrx/store";

export class RemoveAccountRequest implements Action {
    static readonly type = "options:remove-account-request";
    readonly type = RemoveAccountRequest.type;

    constructor(public login: string) {}
}
