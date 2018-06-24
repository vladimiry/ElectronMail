import {Action} from "@ngrx/store";

import {PasswordChangeContainer} from "_@shared/model/container";

export class ChangeMasterPasswordRequest implements Action {
    static readonly type = "options:change-master-password-request";
    readonly type = ChangeMasterPasswordRequest.type;

    constructor(public passwordChangeContainer: PasswordChangeContainer) {}
}
