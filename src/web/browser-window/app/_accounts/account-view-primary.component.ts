import {ChangeDetectionStrategy, Component, Injector, OnInit} from "@angular/core";
import {Subject, from, race} from "rxjs";
import {distinctUntilChanged, filter, map, pairwise, take, takeUntil} from "rxjs/operators";
import {equals, pick} from "remeda";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountConfig} from "src/shared/model/account";
import {AccountViewAbstractComponent} from "src/web/browser-window/app/_accounts/account-view-abstract.component";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";
import {testProtonAppPage} from "src/shared/util";

const pickCredentialFields = ((fields: Array<keyof AccountConfig>) => {
    return (accountConfig: AccountConfig) => pick(accountConfig, fields);
})(["credentials"]);

const pickLoginDelayFields = ((fields: Array<keyof AccountConfig>) => {
    return (accountConfig: AccountConfig) => pick(accountConfig, fields);
})(["loginDelayUntilSelected", "loginDelaySecondsRange"]);

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
                {
                    const {src: url} = webView;
                    const {shouldInitProviderApi} = testProtonAppPage({url, logger: this.logger});

                    if (!shouldInitProviderApi) {
                        this.event.emit({
                            type: "log",
                            data: ["info", `skip webview.dom-ready processing for ${url} page`]
                        });
                        this.event.emit({
                            type: "action",
                            payload: this.accountsService.generateNotificationsStateResetAction({login: this.account.accountConfig.login}),
                        });
                        return;
                    }
                }

                const finishPromise = this.filterDomReadyOrDestroyedPromise();
                const breakPreviousSyncing$ = new Subject<void>();

                this.event.emit({
                    type: "action",
                    payload: ACCOUNTS_ACTIONS.SetupNotificationChannel({account: this.account, webView, finishPromise}),
                });

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
                    .subscribe(({pk, data}) => {
                        breakPreviousSyncing$.next();

                        if (!data.loggedIn || !data.database) {
                            return; // syncing disabled
                        }

                        const syncingFinishPromise = race([
                            from(finishPromise),
                            breakPreviousSyncing$.pipe(take(1)),
                        ]).toPromise().then(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function

                        this.event.emit({
                            type: "action",
                            payload: ACCOUNTS_ACTIONS.ToggleSyncing({pk, webView, finishPromise: syncingFinishPromise}),
                        });
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
                        curr.notifications.pageType.type !== "unknown"
                        &&
                        !equals(prev.notifications.pageType, curr.notifications.pageType)
                    ) || (
                        // creds changed
                        !equals(pickCredentialFields(prev.accountConfig), pickCredentialFields(curr.accountConfig))
                    ) || (
                        // login delay values changed
                        !equals(pickLoginDelayFields(prev.accountConfig), pickLoginDelayFields(curr.accountConfig))
                    );
                }),
                map(([, curr]) => curr),
            ).subscribe((account) => {
                this.event.emit({type: "log", data: ["info", `webview mounted: dispatch "TryToLogin"`]});
                this.event.emit({type: "action", payload: ACCOUNTS_ACTIONS.TryToLogin({account, webView})});
            }),
        );
    }
}
