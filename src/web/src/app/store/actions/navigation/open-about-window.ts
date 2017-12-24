import {Action} from "@ngrx/store";

export class OpenAboutWindow implements Action {
    static readonly type = "navigation:open-about-window";
    readonly type = OpenAboutWindow.type;
}
