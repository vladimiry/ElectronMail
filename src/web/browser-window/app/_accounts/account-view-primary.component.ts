import {Component, Injector} from "@angular/core";
import {distinctUntilChanged, map, takeUntil, withLatestFrom} from "rxjs/operators";
import {firstValueFrom, race, Subject} from "rxjs";
import {isDeepEqual} from "remeda";
import type {OnInit} from "@angular/core";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsService} from "./accounts.service";
import {AccountViewAbstractComponent} from "./account-view-abstract-component.directive";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import {ONE_SECOND_MS} from "src/shared/const";

@Component({
    selector: "electron-mail-account-view-primary",
    template: "",
})
export class AccountViewPrimaryComponent extends AccountViewAbstractComponent implements OnInit {
    // private readonly logger = getWebLogger(__filename, nameof(AccountViewPrimaryComponent));

    private readonly accountsService: AccountsService;

    constructor(
        injector: Injector,
    ) {
        super("primary", injector);
        this.accountsService = injector.get(AccountsService);
    }

    ngOnInit(): void {
        const cancelPreviousSyncing$ = new Subject<void>();

        this.addSubscription(
            this.filterEvent("ipc-message")
                .pipe(withLatestFrom(this.account$))
                .subscribe(async ([{webView, channel}, account]) => {
                    if (channel === IPC_WEBVIEW_API_CHANNELS_MAP["primary-login"].registered) {
                        // TODO move to "effects"
                        const {login} = account.accountConfig;
                        await this.injector.get(ElectronService).primaryLoginWebViewClient(
                            {webView}, {
                                finishPromise: firstValueFrom(this.buildNavigationOrDestroyingSingleNotification()),
                                timeoutMs: ONE_SECOND_MS * 10
                            },
                        )("fillLogin")({accountIndex: account.accountIndex, login});
                        this.action(ACCOUNTS_ACTIONS.Patch({login, patch: {loginFilledOnce: true}}));
                    } else if (channel === IPC_WEBVIEW_API_CHANNELS_MAP.primary.registered) {
                        this.action(
                            ACCOUNTS_ACTIONS.SetupPrimaryNotificationChannel(
                                {
                                    account,
                                    webView,
                                    finishPromise: firstValueFrom(this.buildNavigationOrDestroyingSingleNotification()),
                                },
                            ),
                        );

                        this.account$
                            .pipe(
                                map(({notifications, accountConfig, accountIndex}) => ({
                                    pk: {login: accountConfig.login, accountIndex},
                                    data: {loggedIn: notifications.loggedIn, database: accountConfig.database},
                                })),
                                // process switching of either "loggedIn" or "database" flags
                                distinctUntilChanged(({data: prev}, {data: curr}) => isDeepEqual(prev, curr)),
                                takeUntil(this.buildNavigationOrDestroyingSingleNotification()),
                            )
                            .subscribe(({pk, data: {loggedIn, database}}) => {
                                cancelPreviousSyncing$.next(void 0);
                                if (!loggedIn || !database) {
                                    return; // syncing disabled
                                }
                                this.action(
                                    ACCOUNTS_ACTIONS.ToggleSyncing({
                                        pk,
                                        webView,
                                        finishPromise: firstValueFrom(
                                            race(this.buildNavigationOrDestroyingSingleNotification(), cancelPreviousSyncing$),
                                        ),
                                    }),
                                );
                            });
                    }
                }),
        );

        this.addSubscription(
            this.filterEvent("dom-ready")
                .pipe(withLatestFrom(this.account$))
                .subscribe(([, account]) => {
                    // app set's app notification channel on webview.dom-ready event
                    // which means user is not logged-in yet at this moment, so resetting the state
                    this.action(
                        this.accountsService
                            .generatePrimaryNotificationsStateResetAction({login: account.accountConfig.login}),
                    );
                }),
        );
    }
}
