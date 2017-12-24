import {Action} from "@ngrx/store";

export class ToggleCompactRequest implements Action {
    static readonly type = "options:toggle-compact-request";
    readonly type = ToggleCompactRequest.type;
}
