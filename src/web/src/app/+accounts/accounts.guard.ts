import {CanActivate} from "@angular/router";
import {concatMap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {Observable, of} from "rxjs";
import {Store} from "@ngrx/store";

import {AccountsSelectors} from "src/web/src/app/store/selectors";
import {NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/src/app/app.constants";
import {State} from "src/web/src/app/store/reducers/accounts";

@Injectable()
export class AccountsGuard implements CanActivate {
    constructor(
        private store: Store<State>,
    ) {}

    canActivate(): Observable<boolean> {
        return this.store.select(AccountsSelectors.FEATURED.initialized).pipe(concatMap((initialized) => {
            if (initialized) {
                return of(true);
            }

            this.store.dispatch(NAVIGATION_ACTIONS.Go({path: [{outlets: {[SETTINGS_OUTLET]: SETTINGS_PATH}}]}));

            return of(false);
        }));
    }
}
