import {Component, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, combineLatest} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map} from "rxjs/operators";
import {equals} from "remeda";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";

@Component({
    selector: "electron-mail-accounts",
    templateUrl: "./accounts.component.html",
    styleUrls: ["./accounts.component.scss"],
    preserveWhitespaces: true,
})
export class AccountsComponent implements OnInit, OnDestroy {
    initialized$ = this.store.pipe(select(AccountsSelectors.FEATURED.initialized));
    layoutMode$ = this.store.pipe(select(OptionsSelectors.CONFIG.layoutMode));
    hideControls$ = this.store.pipe(select(OptionsSelectors.CONFIG.hideControls));
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
        private coreService: CoreService,
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

    ngOnInit(): void {
        this.subscription.add(
            this.accounts$.subscribe((accounts) => {
                this.accountsMap = new Map(accounts.reduce((entries: Array<[string, WebAccount]>, account) => {
                    return entries.concat([[account.accountConfig.login, account]]);
                }, []));
            }),
        );
        this.subscription.add(
            combineLatest([
                this.store.select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary).pipe(
                    distinctUntilChanged((prev, curr) => equals(prev, curr)), // TODO => "distinctUntilChanged(equals)"
                ),
                this.store.pipe(select(OptionsSelectors.CONFIG.trayIconColor)),
                this.store.pipe(select(OptionsSelectors.CONFIG.unreadBgColor)),
                this.store.pipe(select(OptionsSelectors.CONFIG.unreadTextColor)),
            ]).subscribe(([{hasLoggedOut, unread}, trayIconColor, unreadBgColor, unreadTextColor]) => {
                this.unreadSummary = unread;
                this.store.dispatch(NOTIFICATION_ACTIONS.UpdateOverlayIcon(
                    {hasLoggedOut, unread, trayIconColor, unreadBgColor, unreadTextColor},
                ));
            }),
        );
        this.subscription.add(
            this.store.pipe(
                select(AccountsSelectors.FEATURED.selectedAccount),
                // distinctUntilChanged((prev, curr) => Boolean(prev && curr && prev.accountConfig.login === curr.accountConfig.login)),
            ).subscribe(async (selectedAccount) => {
                if (this.selectedAccount === selectedAccount) {
                    return;
                }
                this.selectedAccount = selectedAccount;
                if (!this.selectedAccount) {
                    await this.api.ipcMainClient()("selectAccount")({reset: true});
                }
            }),
        );
    }

    trackAccount(
        ...[, account]: readonly [number, WebAccount | undefined]
    ): WebAccount["accountConfig"]["login"] | undefined {
        return account ? account.accountConfig.login : undefined;
    }

    activateAccount(event: Event, account: WebAccount): void {
        event.preventDefault();
        this.store.dispatch(ACCOUNTS_ACTIONS.Select({login: account.accountConfig.login}));
    }

    openSettingsView(): void {
        this.coreService.openSettingsView();
    }

    openAddingAccountView(): void {
        this.store.dispatch(NAVIGATION_ACTIONS.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: `${SETTINGS_PATH}/account-edit`}}],
        }));
    }

    openAboutWindow(): void {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenAboutWindow());
    }

    openSettingsFolder(): void {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }

    logout(): void {
        this.coreService.logOut();
    }

    quit(): void {
        this.store.dispatch(NAVIGATION_ACTIONS.Quit());
    }

    cancelEvent(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
