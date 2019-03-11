import {BehaviorSubject, Subscription} from "rxjs";
import {ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, filter} from "rxjs/operators";

import {ACCOUNTS_ACTIONS} from "src/web/src/app/store/actions";
import {AccountsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/accounts";
import {WebAccount} from "src/web/src/app/model";

interface ComponentState {
    account: WebAccount;
    selected: boolean;
    stored: boolean;
}

@Component({
    selector: "electron-mail-account-title",
    templateUrl: "./account-title.component.html",
    styleUrls: ["./account-title.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountTitleComponent implements OnInit, OnDestroy {
    @Input()
    highlighting: boolean = true;

    private stateSubject$ = new BehaviorSubject<ComponentState>({
        // account: null,
        selected: false,
        stored: false,
    } as ComponentState);

    // TODO consider replacing observable with just an object explicitly triggering ChangeDetectorRef.detectChanges() after its mutation
    // tslint:disable-next-line:member-ordering
    state$ = this.stateSubject$
        .asObservable()
        .pipe(
            filter((s) => Boolean(s.account)),
            // .pipe(debounceTime(200)),
        );

    private accountLogin!: string;

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
    ) {}

    @Input()
    set account(account: WebAccount) {
        this.accountLogin = account.accountConfig.login;

        this.patchState({
            account,
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
                )
                .subscribe((selectedLogin) => {
                    this.patchState({selected: selectedLogin === this.accountLogin});
                }),
        );
    }

    toggleViewMode(event: Event) {
        event.stopPropagation();
        this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView({login: this.accountLogin}));
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    private patchState(patch: Partial<ComponentState>) {
        this.stateSubject$.next({...this.stateSubject$.value, ...patch});
    }
}
