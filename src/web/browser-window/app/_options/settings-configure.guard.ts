import type {CanActivate} from "@angular/router";
import {concatMap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {Observable, of} from "rxjs";
import {select, Store} from "@ngrx/store";

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
                if (!state._initialized) {
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
