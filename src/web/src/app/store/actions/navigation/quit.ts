import {Action} from "@ngrx/store";

export class Quit implements Action {
    static readonly type = "navigation:quit";
    readonly type = Quit.type;
}
