import {Action} from "@ngrx/store";

import {ProgressPatch} from "_@web/src/app/store/reducers/options";

export class PatchProgress implements Action {
    static readonly type = "options:patch-progress";
    readonly type = PatchProgress.type;

    constructor(public patch: ProgressPatch) {}
}
