import {distinctUntilChanged, mergeMap} from "rxjs/operators";
import {EMPTY, Observable, of} from "rxjs";
import {select, Store} from "@ngrx/store";

import {AccountConfig} from "src/shared/model/account";
import {DbViewSelectors} from "src/web/browser-window/app/store/selectors";
import {Instance} from "src/web/browser-window/app/store/reducers/db-view";

export const resolveInstance$ = (store: Store, login$: Observable<AccountConfig["login"]>): Observable<Instance> => {
    return login$.pipe(
        mergeMap((login) => store.pipe(
            select(DbViewSelectors.FEATURED.instance(), login),
            distinctUntilChanged(),
            mergeMap((instance) => instance ? of(instance) : EMPTY),
        )),
    );
};
