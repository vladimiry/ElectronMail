import {Action} from "@ngrx/store";

export class InitRequest implements Action {
    static readonly type = "options:get-electron-locations-request";
    readonly type = InitRequest.type;
}
