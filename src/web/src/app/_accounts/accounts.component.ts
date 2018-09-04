import {Component, OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {Subscription} from "rxjs";
import {distinctUntilChanged, map} from "rxjs/operators";
import {equals} from "ramda";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/src/app/store/selectors";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/src/app/app.constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {WebAccount} from "src/web/src/app/model";

@Component({
    selector: "email-securely-app-accounts",
    templateUrl: "./accounts.component.html",
    styleUrls: ["./accounts.component.scss"],
    preserveWhitespaces: true,
})
export class AccountsComponent implements OnInit, OnDestroy {
    accounts$ = this.store.select(AccountsSelectors.FEATURED.accounts);
    loginsSet$ = this.accounts$.pipe(
        map((accounts) => accounts.map((account) => account.accountConfig.login)),
        distinctUntilChanged((prev, curr) => equals([...prev].sort(), [...curr].sort())),
    );
    compactLayout$ = this.store.select(OptionsSelectors.CONFIG.compactLayout);
    initialized$ = this.store.select(AccountsSelectors.FEATURED.initialized);
    accounts: WebAccount[] = [];
    selectedAccount?: WebAccount;
    unreadSummary?: number;
    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
    ) {}

    ngOnInit() {
        this.subscription.add(
            this.accounts$.subscribe((accounts) => this.accounts = accounts),
        );
        this.subscription.add(
            this.store.select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary)
                .pipe(distinctUntilChanged((prev, curr) => equals(prev, curr))) // TODO => "distinctUntilChanged(equals)"
                .subscribe(({hasLoggedOut, unread}) => {
                    this.unreadSummary = unread;
                    this.store.dispatch(CORE_ACTIONS.UpdateOverlayIcon({hasLoggedOut, unread}));
                }),
        );
        this.subscription.add(
            this.store.pipe(
                select(AccountsSelectors.FEATURED.selectedAccount),
                distinctUntilChanged((prev, curr) => Boolean(prev && curr && prev.accountConfig.login === curr.accountConfig.login)),
            ).subscribe((selectedAccount) => {
                this.selectedAccount = selectedAccount;
            }),
        );
    }

    trackAccount(index: number, account?: WebAccount) {
        return account ? account.accountConfig.login : undefined;
    }

    activateAccount(event: Event, account: WebAccount) {
        event.preventDefault();
        this.store.dispatch(ACCOUNTS_ACTIONS.Activate({login: account.accountConfig.login}));
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

    cancelEvent(event: Event) {
        event.preventDefault();
        event.stopPropagation();
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
}
