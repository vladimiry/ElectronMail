import {Action} from "@ngrx/store";

export class RemoveError implements Action {
    static readonly type = "core:remove-error";
    readonly type = RemoveError.type;

    constructor(public error: Error) {}
}
