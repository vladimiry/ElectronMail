import {ChangeDetectionStrategy, Component, Injector, OnInit} from "@angular/core";
import {Subject, from, race} from "rxjs";
import {distinctUntilChanged, filter, map, pairwise, take, takeUntil} from "rxjs/operators";
import {equals, pick} from "remeda";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountConfig} from "src/shared/model/account";
import {AccountViewAbstractComponent} from "src/web/browser-window/app/_accounts/account-view-abstract.component";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";
import {testProtonMailAppPage} from "src/shared/util";

@Component({
    selector: "electron-mail-account-view-primary",
    templateUrl: "./account-view-primary.component.html",
    styleUrls: ["./account-view-primary.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountViewPrimaryComponent extends AccountViewAbstractComponent implements OnInit {
    private readonly logger = getZoneNameBoundWebLogger(`[_accounts/account-view-primary.component]`);

    private readonly accountsService: AccountsService;

    constructor(
        injector: Injector,
    ) {
        super("primary", injector);
        this.accountsService = injector.get(AccountsService);
    }

    ngOnInit(): void {
        this.addSubscription(
            this.filterDomReadyEvent()
                .pipe(take(1))
                .subscribe(({webView}) => this.onWebViewDomReadyOnceHandler(webView)),
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
                        map(({notifications, accountConfig}) => ({
                            pk: {login: accountConfig.login},
                            data: {loggedIn: notifications.loggedIn, database: accountConfig.database},
                        })),
                        // process switching of either "loggedIn" or "database" flags
                        distinctUntilChanged((prev, curr) => equals(prev.data, curr.data)),
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

    private onWebViewDomReadyOnceHandler(webView: Electron.WebviewTag): void {
        this.addSubscription(
            this.account$.pipe(
                pairwise(),
                filter(([prev, curr]) => {
                    return (
                        // page changed: "entryUrl" is changeable
                        // so need to react on "url" change too (deep comparison with "equals")
                        (
                            curr.notifications.pageType.type !== "unknown"
                            &&
                            !equals(prev.notifications.pageType, curr.notifications.pageType)
                        )
                        ||
                        // credentials changed
                        !equals(this.pickCredentialFields(prev.accountConfig), this.pickCredentialFields(curr.accountConfig))
                        ||
                        // login delay values changed
                        !equals(this.pickLoginDelayFields(prev.accountConfig), this.pickLoginDelayFields(curr.accountConfig))
                    );
                }),
                map(([, curr]) => curr),
            ).subscribe((account) => {
                this.log("info", [`webview mounted: dispatch "TryToLogin"`]);
                this.action(ACCOUNTS_ACTIONS.TryToLogin({account, webView}));
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
