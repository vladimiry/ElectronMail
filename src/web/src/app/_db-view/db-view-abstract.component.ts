import {EMPTY, Observable} from "rxjs";
import {Input} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {mergeMap} from "rxjs/operators";

import {DbAccountPk} from "src/shared/model/database";
import {FEATURED} from "src/web/src/app/store/selectors/db-view";
import {NgChangesObservableComponent} from "src/web/src/app/components/ng-changes-observable.component";
import {State} from "src/web/src/app/store/reducers/db-view";

export abstract class DbViewAbstractComponent extends NgChangesObservableComponent {
    @Input()
    dbAccountPk!: DbAccountPk;

    dbAccountPk$: Observable<DbAccountPk> = this.ngChangesObservable("dbAccountPk").pipe(
        mergeMap((value) => value ? [value] : EMPTY),
    );

    instance$ = this.dbAccountPk$.pipe(
        mergeMap((pk) => this.store.pipe(
            select(FEATURED.instance(), {pk}),
            mergeMap((instance) => instance ? [instance] : EMPTY),
        )),
    );

    protected constructor(
        protected store: Store<State>,
    ) {
        super();
    }
}
