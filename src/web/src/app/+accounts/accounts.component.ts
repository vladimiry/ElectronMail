import {Component, OnDestroy, OnInit} from "@angular/core";
import {concatMap, distinctUntilChanged, filter, mergeMap, take, takeUntil} from "rxjs/operators";
import {equals} from "ramda";
import {Store} from "@ngrx/store";
import {Subject} from "rxjs";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/src/app/store/selectors";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/src/app/app.constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {WebAccount} from "src/shared/model/account";

@Component({
    selector: "email-securely-app-accounts",
    templateUrl: "./accounts.component.html",
    styleUrls: ["./accounts.component.scss"],
    preserveWhitespaces: true,
})
export class AccountsComponent implements OnInit, OnDestroy {
    compactLayout$ = this.store.select(OptionsSelectors.CONFIG.compactLayout);
    accounts$ = this.store.select(AccountsSelectors.FEATURED.accounts);
    initialized$ = this.store.select(AccountsSelectors.FEATURED.initialized);
    selectedLogin$ = this.store.select(AccountsSelectors.FEATURED.selectedLogin);
    accounts: WebAccount[] = [];
    selectedAccount?: WebAccount;
    unreadSummary?: number;
    unSubscribe$ = new Subject();

    constructor(
        private store: Store<State>,
    ) {}

    ngOnInit() {
        this.store.select(OptionsSelectors.FEATURED.electronLocations).pipe(
            filter((value) => Boolean(value)),
            mergeMap((value) => value ? [value] : []),
            take(1),
            concatMap(({preload}) => this.accounts$),
            takeUntil(this.unSubscribe$),
        ).subscribe((accounts) => {
            this.accounts = accounts;
        });

        this.store.select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary)
            .pipe(
                distinctUntilChanged((prev, curr) => equals(prev, curr)), // TODO => "distinctUntilChanged(equals)"
                takeUntil(this.unSubscribe$),
            )
            .subscribe(({hasLoggedOut, unread}) => {
                this.unreadSummary = unread;
                this.store.dispatch(CORE_ACTIONS.UpdateOverlayIcon({hasLoggedOut, unread}));
            });

        this.store.select(AccountsSelectors.FEATURED.selectedAccount)
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe((selectedAccount) => this.selectedAccount = selectedAccount);
    }

    activateAccount(account: WebAccount) {
        this.store.dispatch(ACCOUNTS_ACTIONS.Activate({login: account.accountConfig.login}));
    }

    trackAccount(index: number, account?: WebAccount) {
        return account ? account.accountConfig.login : undefined;
    }

    openSettingsView() {
        this.store.dispatch(NAVIGATION_ACTIONS.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: SETTINGS_PATH}}],
        }));
    }

    openAddingAccountView() {
        this.store.dispatch(NAVIGATION_ACTIONS.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: `${SETTINGS_PATH}/account-edit`}}],
        }));
    }

    openAboutWindow() {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenAboutWindow());
    }

    openSettingsFolder() {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }

    toggleCompactLayout() {
        this.store.dispatch(OPTIONS_ACTIONS.ToggleCompactRequest());
    }

    logout() {
        this.store.dispatch(NAVIGATION_ACTIONS.Logout());
    }

    quit() {
        this.store.dispatch(NAVIGATION_ACTIONS.Quit());
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
