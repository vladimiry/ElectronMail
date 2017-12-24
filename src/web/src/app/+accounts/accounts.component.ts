import {distinctUntilChanged} from "rxjs/operators/distinctUntilChanged";
import {map, takeUntil} from "rxjs/operators";
import {Subject} from "rxjs/Subject";
import {Component, OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";

import {WebAccount} from "_shared/model/account";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "_web_app/app.constants";
import {AccountsActions, NavigationActions, OptionsActions} from "_web_app/store/actions";
import {
    accountsSelector, accountsUnreadSummarySelector, initializedSelector, selectedAccountSelector, selectedLoginSelector,
    State,
} from "_web_app/store/reducers/accounts";
import {configCompactLayoutSelector, progressSelector} from "_web_app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-accounts`,
    templateUrl: "./accounts.component.html",
    styleUrls: ["./accounts.component.scss"],
    preserveWhitespaces: true,
})
export class AccountsComponent implements OnInit, OnDestroy {
    accounts$ = this.store.select(accountsSelector);
    accountsUnreadSummary$ = this.store.select(accountsUnreadSummarySelector);
    initialized$ = this.store.select(initializedSelector);
    selectedLogin$ = this.store.select(selectedLoginSelector);
    selectedAccount$ = this.store.select(selectedAccountSelector);
    compactLayout$ = this.store.select(configCompactLayoutSelector);
    togglingCompactLayout$ = this.store.select(progressSelector)
        .pipe(map(({togglingCompactLayout}) => togglingCompactLayout));
    accounts: WebAccount[] = [];
    unSubscribe$ = new Subject();

    constructor(private store: Store<State>) {}

    ngOnInit() {
        this.accounts$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe((accounts) => this.accounts = accounts);

        this.accountsUnreadSummary$
            .pipe(
                distinctUntilChanged(),
                takeUntil(this.unSubscribe$),
            )
            .subscribe((unread) => this.store.dispatch(new AccountsActions.UpdateOverlayIcon(unread)));
    }

    activateAccount(account: WebAccount) {
        this.store.dispatch(new AccountsActions.ActivateAccount(account.accountConfig.login));
    }

    trackAccount(index: number, account: WebAccount) {
        return account ? `${account.accountConfig.login}` : undefined;
    }

    openSettingsView() {
        this.store.dispatch(new NavigationActions.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: SETTINGS_PATH}}],
        }));
    }

    openAddingAccountView() {
        this.store.dispatch(new NavigationActions.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: `${SETTINGS_PATH}/account-edit`}}],
        }));
    }

    openAboutWindow() {
        this.store.dispatch(new NavigationActions.OpenAboutWindow());
    }

    openSettingsFolder() {
        this.store.dispatch(new NavigationActions.OpenSettingsFolder());
    }

    toggleCompactLayout() {
        this.store.dispatch(new OptionsActions.ToggleCompactRequest());
    }

    logout() {
        this.store.dispatch(new NavigationActions.Logout());
    }

    quit() {
        this.store.dispatch(new NavigationActions.Quit());
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
