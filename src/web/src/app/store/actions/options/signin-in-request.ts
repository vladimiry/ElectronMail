import {Action} from "@ngrx/store";

import {PasswordFieldContainer} from "_@shared/model/container";

export class SignInRequest implements Action {
    static readonly type = "options:sign-in-request";
    readonly type = SignInRequest.type;

    constructor(public payload: PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean }) {}
}
