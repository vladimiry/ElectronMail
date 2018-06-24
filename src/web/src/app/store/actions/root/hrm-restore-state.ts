import {Action} from "@ngrx/store";

import {State} from "_@web/src/app/store/reducers/root";

export class HrmStateRestoreAction implements Action {
    static readonly type = "root:HRM_SET_ROOT_STATE";
    readonly type = HrmStateRestoreAction.type;

    constructor(public state: State) {}
}
