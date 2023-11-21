import {ChangeDetectionStrategy, Component} from "@angular/core";
import {combineLatest, Observable, Subscription} from "rxjs";
import {distinctUntilChanged, map} from "rxjs/operators";
import {isDeepEqual} from "remeda";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {AccountConfig} from "src/shared/model/account";
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
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsComponent implements OnInit, OnDestroy {
    unreadSummary?: number;
    readonly userDataDir = __METADATA__.electronLocations.userDataDir;
    readonly initialized$: Observable<boolean | undefined>;
    readonly layoutMode$: Observable<"top" | "left" | "left-thin">;
    readonly hideControls$: Observable<boolean>;
    readonly accounts$: Observable<WebAccount[]>;
    readonly loginsDistinctAccountCountChange$: Observable<string[]>;
    readonly selectedLogin$ = this.store.pipe(
        select(AccountsSelectors.FEATURED.selectedLogin),
        distinctUntilChanged(),
    );
    private readonly subscription = new Subscription();

    constructor(
        private readonly coreService: CoreService,
        private readonly api: ElectronService,
        private readonly store: Store<State>,
    ) {
        this.initialized$ = this.store.pipe(select(AccountsSelectors.FEATURED.initialized));
        this.layoutMode$ = this.store.pipe(select(OptionsSelectors.CONFIG.layoutMode));
        this.hideControls$ = this.store.pipe(select(OptionsSelectors.CONFIG.hideControls));
        this.accounts$ = this.store.pipe(select(AccountsSelectors.FEATURED.accounts));
        this.loginsDistinctAccountCountChange$ = this.accounts$.pipe(
            map((accounts) => accounts.map(({accountConfig: {login}}) => login)),
            distinctUntilChanged(({length: prev}, {length: curr}) => prev === curr),
        );
    }

    ngOnInit(): void {
        this.subscription.add(
            combineLatest([
                this.store.select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary).pipe(
                    distinctUntilChanged((prev, curr) => isDeepEqual(prev, curr)), // TODO => "distinctUntilChanged(isDeepEqual)",
                ),
                this.store.pipe(select(OptionsSelectors.CONFIG.trayIconColor)),
                this.store.pipe(select(OptionsSelectors.CONFIG.unreadBgColor)),
                this.store.pipe(select(OptionsSelectors.CONFIG.unreadTextColor)),
                this.store.pipe(select(OptionsSelectors.CONFIG.doNotRenderNotificationBadgeValue)),
                this.store.pipe(select(OptionsSelectors.CONFIG.disableNotLoggedInTrayIndication)),
                this.store.pipe(select(OptionsSelectors.CONFIG.customTrayIconSize)),
                this.store.pipe(select(OptionsSelectors.CONFIG.customTrayIconSizeValue)),
            ]).subscribe(([{hasLoggedOut, unread}]) => {
                this.unreadSummary = unread;
                this.store.dispatch(NOTIFICATION_ACTIONS.UpdateOverlayIcon({hasLoggedOut, unread}));
            }),
        );
        this.subscription.add(
            this.selectedLogin$.subscribe(async () => {
                await this.api.ipcMainClient()("selectAccount")({reset: true});
            }),
        );
    }

    trackAccountByLogin(...[, {accountConfig: {login}}]: readonly [number, WebAccount]): WebAccount["accountConfig"]["login"] {
        return login;
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
