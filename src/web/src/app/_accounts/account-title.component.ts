import {ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit} from "@angular/core";
import {ReplaySubject, Subscription, of} from "rxjs";
import {Store, select} from "@ngrx/store";
import {animate, state, style, transition, trigger} from "@angular/animations";
import {distinctUntilChanged, filter, take, withLatestFrom} from "rxjs/operators";

import {ACCOUNTS_ACTIONS} from "src/web/src/app/store/actions";
import {AccountsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/accounts";
import {WebAccount} from "src/web/src/app/model";

export const FADE_ANIMATION = trigger("fade", [
    state("on", style({opacity: 0})),
    state("off", style({opacity: 1})),
    transition("* <=> *", [
        animate(1000),
    ]),
]);

interface ComponentState {
    account: WebAccount;
    selected: boolean;
    stored: boolean;
    fade: "on" | "off";
}

@Component({
    selector: "email-securely-app-account-title",
    templateUrl: "./account-title.component.html",
    styleUrls: ["./account-title.component.scss"],
    animations: [FADE_ANIMATION],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountTitleComponent implements OnInit, OnDestroy {
    @Input()
    highlighting: boolean = true;

    private stateSubject$ = new ReplaySubject<ComponentState>(1);

    // TODO consider replace observable with just an object explicitly triggering ChangeDetectorRef.detectChanges() after its mutation
    // tslint:disable-next-line:member-ordering
    state$ = this.stateSubject$.asObservable(); // .pipe(debounceTime(200))

    private stateInitiaized?: boolean;

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
    ) {}

    @Input()
    set account(account: WebAccount) {
        this.patchState({
            account,
            fade: account.progress.syncing ? "on" : "off",
            stored: account.accountConfig.database,
        });
    }

    ngOnInit() {
        if (!this.highlighting) {
            return;
        }

        this.subscription.add(
            this.store
                .pipe(
                    select(AccountsSelectors.FEATURED.selectedLogin),
                    filter((selectedLogin) => Boolean(selectedLogin)),
                    distinctUntilChanged(),
                    withLatestFrom(this.stateSubject$),
                )
                .subscribe(([selectedLogin, {account}]) => {
                    this.patchState({selected: account.accountConfig.login === selectedLogin});
                }),
        );
    }

    toggleViewMode(event: Event) {
        event.stopPropagation();
        this.stateSubject$.pipe(take(1)).subscribe(({account}) => {
            this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView({login: account.accountConfig.login}));
        });
    }

    onFadeCycleDone() {
        this.stateSubject$.pipe(take(1)).subscribe((value) => {
            const fade = !value.account.progress.syncing
                ? "off"
                : value.fade === "on" ? "off" : "on";
            if (value.fade !== fade) {
                this.patchState({fade});
            }
        });
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    private patchState(patch: Partial<ComponentState>) {
        const currentState$ = this.stateInitiaized
            ? this.stateSubject$
            : of({
                // account: null as any,
                selected: false,
                stored: false,
                fade: "off",
            } as ComponentState);

        this.stateInitiaized = true;

        currentState$.pipe(take(1)).subscribe((value) => {
            this.stateSubject$.next({...value, ...patch});
        });
    }
}
