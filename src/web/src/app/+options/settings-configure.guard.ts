import {concatMap} from "rxjs/operators";
import {Observable, of} from "rxjs";
import {Injectable} from "@angular/core";
import {CanActivate} from "@angular/router";
import {Store} from "@ngrx/store";

import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Injectable()
export class SettingsConfigureGuard implements CanActivate {
    constructor(private store: Store<State>) {}

    canActivate(): Observable<boolean> {
        return this.store.select(OptionsSelectors.STATE).pipe(concatMap((state) => {
            if (!state.electronLocations) {
                this.store.dispatch(OPTIONS_ACTIONS.InitRequest());
                return of(false);
            }

            if (!("_rev" in state.config)) {
                this.store.dispatch(OPTIONS_ACTIONS.GetConfigRequest());
                return of(false);
            }

            if (!("_rev" in state.settings)) {
                this.store.dispatch(OPTIONS_ACTIONS.GetSettingsRequest());
                return of(false);
            }

            return of(true);
        }));
    }
}
