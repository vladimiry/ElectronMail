import {Component, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, combineLatest} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map} from "rxjs/operators";
import {equals} from "ramda";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {BaseConfig} from "src/shared/model/options";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {PRODUCT_NAME} from "src/shared/constants";
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
    compactLayout$ = this.store.pipe(select(OptionsSelectors.CONFIG.compactLayout));
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

    ngOnInit() {
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
            combineLatest([
                this.store.pipe(
                    select(AccountsSelectors.FEATURED.selectedAccount),
                    // distinctUntilChanged((prev, curr) => Boolean(prev && curr && prev.accountConfig.login === curr.accountConfig.login)),
                ),
                this.store.pipe(
                    select(OptionsSelectors.CONFIG.reflectSelectedAccountTitle),
                ),
            ]).subscribe(async ([selectedAccount, reflectSelectedAccountTitle]) => {
                this.patchDocumentTitle({selectedAccount, reflectSelectedAccountTitle});

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

    trackAccount(...[, account]: readonly [number, WebAccount | undefined]) {
        return account ? account.accountConfig.login : undefined;
    }

    activateAccount(event: Event, account: WebAccount) {
        event.preventDefault();
        this.store.dispatch(ACCOUNTS_ACTIONS.Activate({login: account.accountConfig.login}));
    }

    openSettingsView() {
        this.coreService.openSettingsView();
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
        this.coreService.logOut();
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
        this.patchDocumentTitle();
    }

    private patchDocumentTitle(
        {
            reflectSelectedAccountTitle,
            selectedAccount,
        }: Partial<Pick<BaseConfig, "reflectSelectedAccountTitle">> & { selectedAccount?: WebAccount; } = {},
    ) {
        const selectedAccountDocumentTitle = (
            reflectSelectedAccountTitle
            &&
            selectedAccount
            &&
            selectedAccount.accountConfig.type !== "tutanota" // TODO "patchDocumentTitle" not implemented for tutanota
            &&
            selectedAccount.notifications.title
        );
        const newDocumentTitle = PRODUCT_NAME + (
            selectedAccountDocumentTitle
                ? ` | ${selectedAccountDocumentTitle}`
                : ""
        );

        if (document.title !== newDocumentTitle) {
            document.title = newDocumentTitle;
        }
    }
}
