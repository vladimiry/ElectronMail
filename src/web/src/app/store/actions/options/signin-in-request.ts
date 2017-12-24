import {Action} from "@ngrx/store";

import {IpcMainActions} from "_shared/electron-actions";

export class SignInRequest implements Action {
    static readonly type = "options:sign-in-request";
    readonly type = SignInRequest.type;

    constructor(public payload: IpcMainActions.ReadSettings.Type["i"]) {}
}
