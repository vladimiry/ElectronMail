import {Component, OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {Subscription, combineLatest} from "rxjs";
import {distinctUntilChanged, map} from "rxjs/operators";
import {equals} from "remeda";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountConfig} from "src/shared/model/account";
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
    readonly userDataDir = __METADATA__.electronLocations.userDataDir;

    readonly initialized$ = this.store.pipe(select(AccountsSelectors.FEATURED.initialized));

    readonly layoutMode$ = this.store.pipe(select(OptionsSelectors.CONFIG.layoutMode));

    readonly hideControls$ = this.store.pipe(select(OptionsSelectors.CONFIG.hideControls));

    selectedAccount?: WebAccount;

    unreadSummary?: number;

    private accountsMap = new Map<WebAccount["accountConfig"]["login"], WebAccount>();

    private accounts$ = this.store.pipe(select(AccountsSelectors.FEATURED.accounts));

    readonly logins$ = this.accounts$.pipe(
        map((accounts) => accounts.map((account) => account.accountConfig.login)),
        distinctUntilChanged(),
    );

    readonly loginsWithoutOrdering$ = this.logins$.pipe(
        // account views should not be re-crated if we reorder the accounts in the settings
        distinctUntilChanged((prev, curr) => equals([...prev].sort(), [...curr].sort())),
    );

    private readonly subscription = new Subscription();

    constructor(
        private coreService: CoreService,
        private api: ElectronService,
        private store: Store<State>,
    ) {
        this.subscription.add(
            this.accounts$.subscribe((accounts) => {
                this.accountsMap = new Map(accounts.reduce((entries: Array<[string, WebAccount]>, account) => {
                    return entries.concat([[account.accountConfig.login, account]]);
                }, []));
            }),
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

    activateAccountByLogin(event: Event, login: AccountConfig["login"]): void {
        event.preventDefault();
        this.store.dispatch(ACCOUNTS_ACTIONS.Select({login}));
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
