import {Action} from "@ngrx/store";

import {Config} from "_@shared/model/options";

export class GetConfigResponse implements Action {
    static readonly type = "options:get-config-response";
    readonly type = GetConfigResponse.type;

    constructor(public config: Config) {}
}
