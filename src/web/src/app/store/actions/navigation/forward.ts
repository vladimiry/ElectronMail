import {Action} from "@ngrx/store";

export class Forward implements Action {
    static type = "navigation:forward";
    readonly type = Forward.type;
}
