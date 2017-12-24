import {switchMap} from "rxjs/operators";
import {Observable} from "rxjs/Observable";
import {of} from "rxjs/observable/of";
import {Injectable} from "@angular/core";
import {CanActivate} from "@angular/router";
import {Store} from "@ngrx/store";

import {State, stateSelector} from "_web_app/store/reducers/options";
import {OptionsActions} from "_web_app/store/actions";

@Injectable()
export class SettingsConfigureGuard implements CanActivate {
    constructor(private store: Store<State>) {}

    canActivate(): Observable<boolean> {
        return this.store.select(stateSelector).pipe(switchMap((state) => {
            if (!state.electronLocations) {
                this.store.dispatch(new OptionsActions.InitRequest());
                return of(false);
            }

            if (!("_rev" in state.config)) {
                this.store.dispatch(new OptionsActions.GetConfigRequest());
                return of(false);
            }

            if (!("_rev" in state.settings)) {
                this.store.dispatch(new OptionsActions.GetSettingsRequest());
                return of(false);
            }

            return of(true);
        }));
    }
}
