import {Action} from "@ngrx/store";

export class GetConfigRequest implements Action {
    static readonly type = "options:get-config-request";
    readonly type = GetConfigRequest.type;
}
