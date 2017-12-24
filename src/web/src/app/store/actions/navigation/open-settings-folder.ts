import {Action} from "@ngrx/store";

export class OpenSettingsFolder implements Action {
    static readonly type = "navigation:open-settings-folder";
    readonly type = OpenSettingsFolder.type;
}
