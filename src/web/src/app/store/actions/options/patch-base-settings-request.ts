import {Action} from "@ngrx/store";

import {BaseConfig} from "_@shared/model/options";

export class PatchBaseSettingsRequest implements Action {
    static readonly type = "options:patch-base-settings-request";
    readonly type = PatchBaseSettingsRequest.type;

    constructor(public readonly patch: BaseConfig) {}
}
