import {Action} from "@ngrx/store";

export class GetSettingsAutoRequest implements Action {
    static readonly type = "options:get-settings-auto-request";
    readonly type = GetSettingsAutoRequest.type;
}
