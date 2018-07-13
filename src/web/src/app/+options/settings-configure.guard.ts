import {switchMap} from "rxjs/operators";
import {Observable, of} from "rxjs";
import {Injectable} from "@angular/core";
import {CanActivate} from "@angular/router";
import {Store} from "@ngrx/store";

import {State, stateSelector} from "src/web/src/app/store/reducers/options";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";

@Injectable()
export class SettingsConfigureGuard implements CanActivate {
    constructor(private store: Store<State>) {}

    canActivate(): Observable<boolean> {
        return this.store.select(stateSelector).pipe(switchMap((state) => {
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
