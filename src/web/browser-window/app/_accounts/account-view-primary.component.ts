import {Component, Injector, OnInit} from "@angular/core";
import {Subject, combineLatest, from, race} from "rxjs";
import {distinctUntilChanged, filter, map, pairwise, take, takeUntil} from "rxjs/operators";
import {equals, pick} from "remeda";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountConfig} from "src/shared/model/account";
import {AccountViewAbstractComponent} from "src/web/browser-window/app/_accounts/account-view-abstract.component";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {getWebLogger} from "src/web/browser-window/util";
import {testProtonMailAppPage} from "src/shared/util";

@Component({
    selector: "electron-mail-account-view-primary",
    template: "",
})
export class AccountViewPrimaryComponent extends AccountViewAbstractComponent implements OnInit {
    private readonly logger = getWebLogger(`[_accounts/account-view-primary.component]`);

    private readonly accountsService: AccountsService;

    constructor(
        injector: Injector,
    ) {
        super("primary", injector);
        this.accountsService = injector.get(AccountsService);
    }

    ngOnInit(): void {
        this.addSubscription(
            combineLatest([
                // resolves the "webview" and also triggers the login on "entry url change"
                this.filterDomReadyEvent().pipe(
                    filter(({webView: {src: url}}) => testProtonMailAppPage({url, logger: this.logger}).projectType === "proton-mail"),
                ),
                // triggers the login on certain account changes
                this.account$.pipe(
                    pairwise(),
                    filter(([prev, curr]) => {
                        return (
                            // login view displayed
                            (
                                curr.notifications.pageType.type !== "unknown"
                                &&
                                prev.notifications.pageType.type !== curr.notifications.pageType.type
                            )
                            ||
                            // credentials changed
                            !equals(this.pickCredentialFields(prev.accountConfig), this.pickCredentialFields(curr.accountConfig))
                            ||
                            // login delay changed
                            !equals(this.pickLoginDelayFields(prev.accountConfig), this.pickLoginDelayFields(curr.accountConfig))
                        );
                    }),
                    map(([, curr]) => curr),
                )
            ]).subscribe(([{webView}, account]) => {
                this.log("info", [`dispatch "TryToLogin"`]);
                this.action(ACCOUNTS_ACTIONS.TryToLogin({account, webView}));
            }),
        );

        this.addSubscription(
            this.filterDomReadyEvent().subscribe(({webView}) => {
                // app set's app notification channel on webview.dom-ready event
                // which means user is not logged-in yet at this moment, so resetting the state
                this.action(
                    this.accountsService
                        .generatePrimaryNotificationsStateResetAction({login: this.account.accountConfig.login}),
                );

                if (!testProtonMailAppPage({url: webView.src, logger: this.logger}).shouldInitProviderApi) {
                    this.log("info", [`skip webview.dom-ready processing for ${webView.src} page`]);
                    return;
                }

                const finishPromise = this.filterDomReadyOrDestroyedPromise();
                const breakPreviousSyncing$ = new Subject<void>();

                this.action(
                    ACCOUNTS_ACTIONS.SetupPrimaryNotificationChannel({account: this.account, webView, finishPromise}),
                );

                this.account$
                    .pipe(
                        map(({notifications, accountConfig, accountIndex}) => ({
                            pk: {login: accountConfig.login, accountIndex},
                            data: {loggedIn: notifications.loggedIn, database: accountConfig.database},
                        })),
                        // process switching of either "loggedIn" or "database" flags
                        distinctUntilChanged(({data: prev}, {data: curr}) => equals(prev, curr)),
                        takeUntil(from(finishPromise)),
                    )
                    .subscribe(({pk, data: {loggedIn, database}}) => {
                        breakPreviousSyncing$.next();

                        if (!loggedIn || !database) {
                            return; // syncing disabled
                        }

                        this.action(
                            ACCOUNTS_ACTIONS.ToggleSyncing({
                                pk,
                                webView,
                                finishPromise: race([
                                    from(finishPromise),
                                    breakPreviousSyncing$.pipe(take(1)),
                                ]).toPromise(),
                            }),
                        );
                    });
            }),
        );
    }

    private pickCredentialFields(value: AccountConfig): Pick<AccountConfig, "credentials"> {
        return pick(value, ["credentials"]);
    }

    private pickLoginDelayFields(value: AccountConfig): Pick<AccountConfig, "loginDelayUntilSelected" | "loginDelaySecondsRange"> {
        return pick(value, ["loginDelayUntilSelected", "loginDelaySecondsRange"]);
    }
}
