import {Injectable} from "@angular/core";
import {Action} from "@ngrx/store";

import {SETTINGS_OUTLET, SETTINGS_PATH} from "_@web/src/app/app.constants";
import {NavigationActions} from "_@web/src/app/store/actions";

@Injectable()
export class OptionsService {
    buildNavigationAction(opts?: { path?: string, queryParams?: object }): Action {
        const path = opts && "path" in opts ? `${SETTINGS_PATH}${opts.path ? "/" + opts.path : ""}` : null;

        return new NavigationActions.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: path}}],
            queryParams: opts && opts.queryParams,
        });
    }
}
