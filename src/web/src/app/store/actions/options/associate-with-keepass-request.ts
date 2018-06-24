import {Action} from "@ngrx/store";

import {UrlFieldContainer} from "_@shared/model/container";

export class AssociateSettingsWithKeePassRequest implements Action {
    static readonly type = "options:associate-with-keepass-request";
    readonly type = AssociateSettingsWithKeePassRequest.type;

    constructor(public payload: UrlFieldContainer) {}
}
