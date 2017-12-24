import {Action} from "@ngrx/store";

export class Fail implements Action {
    static readonly type = "core:fail";
    readonly type = Fail.type;

    constructor(public error: Error) {}
}
