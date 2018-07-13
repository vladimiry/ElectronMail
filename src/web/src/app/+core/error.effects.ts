import {filter, map} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {Actions, Effect} from "@ngrx/effects";

import {ERRORS_OUTLET, ERRORS_PATH} from "src/web/src/app/app.constants";
import {CORE_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";

@Injectable()
export class ErrorEffects {
    @Effect()
    $error = this.actions$.pipe(
        filter(CORE_ACTIONS.is.Fail),
        map(() => NAVIGATION_ACTIONS.Go({path: [{outlets: {[ERRORS_OUTLET]: ERRORS_PATH}}]})),
    );

    constructor(private actions$: Actions) {}
}
