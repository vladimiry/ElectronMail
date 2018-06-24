import {map} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {Actions, Effect} from "@ngrx/effects";

import {ERRORS_OUTLET, ERRORS_PATH} from "_@web/src/app/app.constants";
import {CoreActions, NavigationActions} from "_@web/src/app/store/actions";

@Injectable()
export class ErrorEffects {
    @Effect()
    $error = this.actions$
        .ofType<CoreActions.Fail>(CoreActions.Fail.type)
        .pipe(map(() => new NavigationActions.Go({path: [{outlets: {[ERRORS_OUTLET]: ERRORS_PATH}}]})));

    constructor(private actions$: Actions) {}
}
