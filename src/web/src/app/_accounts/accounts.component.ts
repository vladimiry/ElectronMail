import {Component, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, combineLatest} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map} from "rxjs/operators";
import {equals} from "ramda";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/src/app/store/selectors";
import {ElectronService} from "src/web/src/app/_core/electron.service";
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
    compactLayout$ = this.store.pipe(select(OptionsSelectors.CONFIG.compactLayout));
    initialized$ = this.store.pipe(select(AccountsSelectors.FEATURED.initialized));
    accountsMap: Map<WebAccount["accountConfig"]["login"], WebAccount> = new Map();
    selectedAccount?: WebAccount;
    unreadSummary?: number;
    loginsSet$: Observable<string[]>;
    private accounts$ = this.store.pipe(select(AccountsSelectors.FEATURED.accounts));
    private subscription = new Subscription();

    get accounts(): WebAccount[] {
        return [...this.accountsMap.values()];
    }

    constructor(
        private api: ElectronService,
        private store: Store<State>,
    ) {
        this.loginsSet$ = this.accounts$.pipe(
            map((accounts) => accounts.map((account) => account.accountConfig.login)),
            distinctUntilChanged((prev, curr) => equals([...prev].sort(), [...curr].sort())),
        );
    }

    getAccountByLogin(login: string): WebAccount {
        const account = this.accountsMap.get(login);
        if (!account) {
            throw new Error(`No account found with "${login}" login`);
        }
        return account;
    }

    ngOnInit() {
        this.subscription.add(
            this.accounts$.subscribe((accounts) => {
                this.accountsMap = new Map(accounts.reduce((entries: Array<[string, WebAccount]>, account) => {
                    return entries.concat([[account.accountConfig.login, account]]);
                }, []));
            }),
        );
        this.subscription.add(
            combineLatest(
                this.store.select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary).pipe(
                    distinctUntilChanged((prev, curr) => equals(prev, curr)), // TODO => "distinctUntilChanged(equals)"
                ),
                this.store.pipe(select(OptionsSelectors.CONFIG.unreadBgColor)).pipe(
                    distinctUntilChanged(),
                ),
            ).subscribe(([{hasLoggedOut, unread}, unreadBgColor]) => {
                this.unreadSummary = unread;
                this.store.dispatch(CORE_ACTIONS.UpdateOverlayIcon({hasLoggedOut, unread, unreadBgColor}));
            }),
        );
        this.subscription.add(
            this.store.pipe(
                select(AccountsSelectors.FEATURED.selectedAccount),
                // distinctUntilChanged((prev, curr) => Boolean(prev && curr && prev.accountConfig.login === curr.accountConfig.login)),
            ).subscribe(async (selectedAccount) => {
                this.selectedAccount = selectedAccount;

                if (!this.selectedAccount) {
                    await this.api.ipcMainClient()("selectAccount")({reset: true}).toPromise();
                }
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
