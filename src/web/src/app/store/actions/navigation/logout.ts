import {Action} from "@ngrx/store";

export class Logout implements Action {
    static readonly type = "navigation:logout";
    readonly type = Logout.type;
}
