import {EMPTY, Observable, of} from "rxjs";
import {Input} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, mergeMap} from "rxjs/operators";

import {DbAccountPk} from "src/shared/model/database";
import {DbViewSelectors} from "src/web/browser-window/app/store/selectors";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {State} from "src/web/browser-window/app/store/reducers/db-view";

export abstract class DbViewAbstractComponent extends NgChangesObservableComponent {
    @Input()
    dbAccountPk!: DbAccountPk;

    dbAccountPk$: Observable<DbAccountPk> = this.ngChangesObservable("dbAccountPk").pipe(
        mergeMap((value) => value ? of(value) : EMPTY),
    );

    instance$ = this.dbAccountPk$.pipe(
        mergeMap((pk) => this.store.pipe(
            select(DbViewSelectors.FEATURED.instance(), {pk}),
            distinctUntilChanged(),
            mergeMap((instance) => instance ? of(instance) : EMPTY),
        )),
    );

    protected constructor(
        protected store: Store<State>,
    ) {
        super();
    }
}
