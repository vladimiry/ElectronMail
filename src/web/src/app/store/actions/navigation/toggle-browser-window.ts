import {Action} from "@ngrx/store";

export class ToggleBrowserWindow implements Action {
    static readonly type = "navigation:toggle-browser-window";
    readonly type = ToggleBrowserWindow.type;

    constructor(public readonly payload: { forcedState?: boolean } = {forcedState: undefined}) {}
}
