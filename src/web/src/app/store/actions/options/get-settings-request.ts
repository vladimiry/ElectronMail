import {Action} from "@ngrx/store";

export class GetSettingsRequest implements Action {
    static readonly type = "options:get-settings-request";
    readonly type = GetSettingsRequest.type;
}
