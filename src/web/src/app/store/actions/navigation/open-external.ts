import {Action} from "@ngrx/store";

export class OpenExternal implements Action {
    static type = "navigation:open-external";
    readonly type = OpenExternal.type;

    constructor(public url: string) {}
}
