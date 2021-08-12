import {BehaviorSubject, Subscription} from "rxjs";
import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import type {OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {filter, map} from "rxjs/operators";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";

interface ComponentState {
    account: WebAccount;
    selected: boolean;
    stored: boolean;
    title: string;
}

@Component({
    selector: "electron-mail-account-title",
    templateUrl: "./account-title.component.html",
    styleUrls: ["./account-title.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountTitleComponent implements OnInit, OnDestroy {
    @Input()
    highlighting = true;

    private stateSubject$ = new BehaviorSubject<ComponentState>({
        // account: null,
        selected: false,
        stored: false,
        title: "",
    } as ComponentState);

    // TODO consider replacing observable with just an object explicitly triggering ChangeDetectorRef.detectChanges() after its mutation
    // tslint:disable-next-line:member-ordering
    state$ = this.stateSubject$
        .asObservable()
        .pipe(
            filter((state) => Boolean(state.account)),
            // .pipe(debounceTime(200)),
            map((state) => {
                return {
                    ...state,
                    loginDelayed: Boolean(state.account.loginDelayedSeconds || state.account.loginDelayedUntilSelected),
                };
            }),
        );

    private accountLogin!: string;

    private subscription = new Subscription();

    @Input()
    set account(account: WebAccount) {
        this.accountLogin = account.accountConfig.login;

        this.patchState({
            account,
            stored: account.accountConfig.database,
            // TODO live attachments export: print export progress in a separate app notifications section, not inside the account button
            title: (
                (account.accountConfig.title || account.accountConfig.login)
                +
                account.dbExportProgress
                    .map((item, idx, {length}) => ` (export${length > 1 ? ` ${idx + 1}` : ""}: ${item.progress}%)`)
                    .join("")
            ),
        });
    }

    constructor(
        private store: Store<State>,
    ) {}

    ngOnInit(): void {
        if (!this.highlighting) {
            return;
        }

        this.subscription.add(
            this.store
                .pipe(select(AccountsSelectors.FEATURED.selectedLogin))
                .subscribe((selectedLogin) => {
                    this.patchState({selected: this.accountLogin === selectedLogin});
                }),
        );
    }

    toggleViewMode(event: Event): void {
        event.stopPropagation();
        this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView({login: this.accountLogin}));
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private patchState(patch: Partial<ComponentState>): void {
        this.stateSubject$.next({...this.stateSubject$.value, ...patch});
    }
}
