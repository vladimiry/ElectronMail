import {Action} from "@ngrx/store";

export class Reset implements Action {
    static readonly type = "accounts:reset";
    readonly type = Reset.type;
}
