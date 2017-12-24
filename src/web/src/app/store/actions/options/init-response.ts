import {Action} from "@ngrx/store";
import {IpcMainActions} from "_shared/electron-actions";

export class InitResponse implements Action {
    static readonly type = "options:init-response";
    readonly type = InitResponse.type;

    constructor(public payload: IpcMainActions.Init.Type["o"]) {}
}
