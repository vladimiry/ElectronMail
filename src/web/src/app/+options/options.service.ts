import {Action} from "@ngrx/store";
import {Injectable} from "@angular/core";

import {NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/src/app/app.constants";

@Injectable()
export class OptionsService {
    settingsNavigationAction(opts?: { path?: string, queryParams?: object }): Action {
        const path = opts && "path" in opts ? `${SETTINGS_PATH}${opts.path ? "/" + opts.path : ""}` : null;

        return NAVIGATION_ACTIONS.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: path}}],
            queryParams: opts && opts.queryParams,
        });
    }
}
