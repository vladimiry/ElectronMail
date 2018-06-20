import {Action} from "@ngrx/store";

import {ElectronContextLocations} from "_shared/model/electron";

export class InitResponse implements Action {
    static readonly type = "options:init-response";
    readonly type = InitResponse.type;

    constructor(public payload: { electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }) {}
}
