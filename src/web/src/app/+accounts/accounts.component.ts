import {distinctUntilChanged, map, takeUntil} from "rxjs/operators";
import {Subject} from "rxjs";
import {Component, OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";

import {WebAccount} from "_@shared/model/account";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "_@web/src/app/app.constants";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "_@web/src/app/store/actions";
import {
    accountsSelector,
    accountsUnreadSummarySelector,
    initializedSelector,
    selectedAccountSelector,
    selectedLoginSelector,
    State,
} from "_@web/src/app/store/reducers/accounts";
import {configCompactLayoutSelector, progressSelector} from "_@web/src/app/store/reducers/options";

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
            .subscribe((unread) => {
                return this.store.dispatch(ACCOUNTS_ACTIONS.UpdateOverlayIcon({
                    count: unread, dataURL: unread > 0 ? createOverlayIconDataURL(unread) : undefined,
                }));
            });
    }

    activateAccount(account: WebAccount) {
        this.store.dispatch(ACCOUNTS_ACTIONS.ActivateAccount({login: account.accountConfig.login}));
    }

    trackAccount(index: number, account: WebAccount) {
        return account ? `${account.accountConfig.login}` : undefined;
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

// TODO move overlay creating logic to backend (main process), send only {count: unread} then
function createOverlayIconDataURL(unread: number): string {
    const canvas = document.createElement("canvas");

    canvas.height = 128;
    canvas.width = 128;
    canvas.style.letterSpacing = "-5px";

    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Failed to get 2d canvas context");
    }

    ctx.fillStyle = "#DC3545";
    ctx.beginPath();
    ctx.ellipse(64, 64, 64, 64, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.font = "90px sans-serif";
    ctx.fillText(String(Math.min(99, unread)), 64, 96);

    return canvas.toDataURL();
}
