import {animationFrameScheduler, combineLatest, EMPTY, fromEvent, merge, Observable, of} from "rxjs";
import {ApplicationRef, ChangeDetectorRef, Directive, inject, Injectable, Input} from "@angular/core";
import {distinctUntilChanged, map, mergeMap, startWith} from "rxjs/operators";
import {select, Store} from "@ngrx/store";

import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {Instance, State} from "src/web/browser-window/app/store/reducers/db-view";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {resolveInstance$} from "./util";
import {WebAccountPk} from "src/web/browser-window/app/model";

@Injectable({providedIn: "root"})
export class AnimationFrameTickScheduler {
    private isScheduled = false;

    constructor(private readonly appRef: ApplicationRef) {}

    schedule(): void {
        if (this.isScheduled) return;
        this.isScheduled = true;
        animationFrameScheduler.schedule(() => {
            this.appRef.tick();
            this.isScheduled = false;
        });
    }
}

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class DbViewAbstractComponent extends NgChangesObservableComponent {
    @Input({required: true})
    webAccountPk!: WebAccountPk;

    webAccountPk$: Observable<WebAccountPk> = this.ngChangesObservable("webAccountPk").pipe(
        mergeMap((value) => value ? of(value) : EMPTY),
    );

    account$ = this.webAccountPk$.pipe(
        mergeMap(({login}) =>
            this.store.pipe(
                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                mergeMap((value) => value ? [value] : EMPTY),
                distinctUntilChanged(),
            )
        ),
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

    protected readonly store: Store<State>;
    protected readonly instance$: Observable<Instance>;
    private readonly cdRef: ChangeDetectorRef;
    private readonly tickScheduler: AnimationFrameTickScheduler;

    protected constructor() {
        super();
        this.cdRef = inject(ChangeDetectorRef);
        this.tickScheduler = inject(AnimationFrameTickScheduler);
        this.store = inject<Store<State>>(Store);
        this.instance$ = resolveInstance$(this.store, this.webAccountPk$.pipe(map(({login}) => login)));
    }

    protected markDirty(): void {
        this.cdRef.markForCheck();
        this.tickScheduler.schedule();
    }
}
