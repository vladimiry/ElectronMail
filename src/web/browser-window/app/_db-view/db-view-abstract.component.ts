import {Directive, Input, ɵmarkDirty as markDirty} from "@angular/core";
import {EMPTY, Observable, combineLatest, fromEvent, merge, of} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map, mergeMap, startWith} from "rxjs/operators";

import {AccountsSelectors, DbViewSelectors} from "src/web/browser-window/app/store/selectors";
import {DbAccountPk} from "src/shared/model/database";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {State} from "src/web/browser-window/app/store/reducers/db-view";

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// tslint:disable-next-line:directive-class-suffix
export abstract class DbViewAbstractComponent extends NgChangesObservableComponent {
    @Input()
    dbAccountPk!: DbAccountPk;

    dbAccountPk$: Observable<DbAccountPk> = this.ngChangesObservable("dbAccountPk").pipe(
        mergeMap((value) => value ? of(value) : EMPTY),
    );

    account$ = this.dbAccountPk$.pipe(
        mergeMap(({login}) => this.store.pipe(
            select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
            mergeMap((value) => value ? [value] : EMPTY),
            distinctUntilChanged(),
        )),
    );

    onlineAndSignedIn$: Observable<boolean> = combineLatest([
        this.account$.pipe(
            map(({notifications}) => notifications.loggedIn),
            distinctUntilChanged(),
        ),
        merge(
            fromEvent(window, "online"),
            fromEvent(window, "offline"),
        ).pipe(
            map(() => navigator.onLine),
            startWith(navigator.onLine),
        ),
    ]).pipe(
        map(([signedIn, online]) => signedIn && online),
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

    protected markDirty() {
        // markDirty does the same job as ViewRef/ChangeDetectorRef.markForCheck
        // only in addition it schedules change detection using requestAnimationFrame
        markDirty(this);
    }
}
