import {Action} from "@ngrx/store";

export class Back implements Action {
    static type = "navigation:back";
    readonly type = Back.type;
}
