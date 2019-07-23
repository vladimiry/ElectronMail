import {CanActivate} from "@angular/router";
import {Injectable} from "@angular/core";
import {Observable, of} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap} from "rxjs/operators";

import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Injectable()
export class SettingsConfigureGuard implements CanActivate {
    constructor(
        private store: Store<State>,
    ) {}

    canActivate(): Observable<boolean> {
        return this.store.pipe(
            select(OptionsSelectors.STATE),
            concatMap((state) => {
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
            }),
        );
    }
}
