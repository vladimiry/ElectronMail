import {combineLatest, firstValueFrom, merge, of, race, Subject, timer} from "rxjs";
import {Component, Injector} from "@angular/core";
import {debounceTime, distinctUntilChanged, filter, first, map, switchMap, takeUntil, tap, withLatestFrom} from "rxjs/operators";
import {isDeepEqual} from "remeda";
import type {OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsService} from "./accounts.service";
import {AccountViewAbstractDirective} from "./account-view-abstract.directive";
import {curryFunctionMembers} from "src/shared/util";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {getWebLogger} from "src/web/browser-window/util";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import {ofType} from "src/shared/util/ngrx-of-type";
import {ONE_SECOND_MS} from "src/shared/const";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {ProtonClientSession} from "src/shared/model/proton";
import {State} from "src/web/browser-window/app/store/reducers/accounts";

@Component({
    standalone: false,
    selector: "electron-mail-account-view-primary",
    template: "",
})
export class AccountViewPrimaryComponent extends AccountViewAbstractDirective implements OnInit {
    private readonly logger = getWebLogger(__filename, nameof(AccountViewPrimaryComponent));

    private readonly loggedIn$ = this.account$.pipe(
        map(({notifications: {loggedIn}}) => loggedIn),
        distinctUntilChanged(),
    );

    constructor(
        injector: Injector,
        private readonly store: Store<State>,
    ) {
        super("primary", injector);
    }

    ngOnInit(): void {
        this.addSubscription(
            this.filterEvent("dom-ready").pipe(
                first(),
            ).subscribe(({webView}) => {
                this.onLoadedOnce(webView);
            }),
        );

        {
            const cancelPreviousSyncing$ = new Subject<void>();

            this.addSubscription(
                this.filterEvent("ipc-message")
                    .pipe(withLatestFrom(this.account$))
                    .subscribe(async ([{webView, channel}, account]) => {
                        if (channel === IPC_WEBVIEW_API_CHANNELS_MAP.login.registered) {
                            // TODO move "fillLogin" call to "effects"
                            const {login} = account.accountConfig;
                            await this.injector.get(ElectronService).primaryLoginWebViewClient(
                                {webView},
                                {
                                    finishPromise: firstValueFrom(this.buildNavigationOrDestroyingSingleNotification()),
                                    timeoutMs: ONE_SECOND_MS * 10,
                                },
                            )("fillLogin")({accountIndex: account.accountIndex, login});
                            this.action(ACCOUNTS_ACTIONS.Patch({login, patch: {loginFilledOnce: true}}));
                        } else if (channel === IPC_WEBVIEW_API_CHANNELS_MAP.common.registered) {
                            this.action(
                                ACCOUNTS_ACTIONS.SetupCommonNotificationChannel(
                                    {
                                        account,
                                        webView,
                                        finishPromise: firstValueFrom(this.buildNavigationOrDestroyingSingleNotification()),
                                    },
                                ),
                            );
                        } else if (channel === IPC_WEBVIEW_API_CHANNELS_MAP.mail.registered) {
                            this.action(
                                ACCOUNTS_ACTIONS.SetupMailNotificationChannel(
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
        }

        this.addSubscription(
            this.filterEvent("dom-ready")
                .pipe(withLatestFrom(this.account$))
                .subscribe(([, account]) => {
                    // app set's app notificatioprivate readonly store: Store<State>, channel on webview.dom-ready event
                    // which means user is not logged-in yet at this moment, so resetting the state
                    this.action(
                        this.injector.get(AccountsService)
                            .generateMailNotificationsStateResetAction({login: account.accountConfig.login}),
                    );
                }),
        );
    }

    onLoadedOnce(webView: Electron.WebviewTag): void {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.logger.info(nameof(AccountViewPrimaryComponent.prototype.onLoadedOnce));

        const commonWebViewClient = this.injector.get(ElectronService).primaryCommonWebViewClient({webView: webView});
        const resolveLiveProtonClientSession = async (): Promise<ProtonClientSession> => {
            const value = await commonWebViewClient("resolveLiveProtonClientSession")(await this.resolveAccountIndex());
            if (!value) {
                throw new Error(`Failed to resolve "proton client session" object`);
            }
            return value;
        };

        {
            const logger = curryFunctionMembers(
                this.logger,
                nameof(AccountViewPrimaryComponent.prototype.onLoadedOnce), // eslint-disable-line @typescript-eslint/unbound-method
                "saving proton session",
            );
            this.addSubscription(
                this.store.pipe(
                    select(OptionsSelectors.CONFIG.persistentSessionSavingInterval),
                    switchMap((persistentSessionSavingInterval) => {
                        return combineLatest([
                            this.loggedIn$.pipe(
                                tap((value) => logger.verbose("trigger: loggedIn$", value)),
                            ),
                            this.persistentSession$.pipe(
                                tap((value) => logger.verbose("trigger: persistentSession$", value)),
                            ),
                            merge(
                                of(null), // fired once to unblock the "combineLatest"
                                this.store.pipe(
                                    select(OptionsSelectors.FEATURED.mainProcessNotificationAction),
                                    ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.ProtonSessionTokenCookiesModified),
                                    debounceTime(ONE_SECOND_MS),
                                    withLatestFrom(this.account$),
                                    filter(([{payload: {key}}, {accountConfig: {login}}]) => key.login === login),
                                    tap(() => logger.verbose("trigger: proton session token cookies modified")),
                                ),
                            ),
                            (
                                persistentSessionSavingInterval > 0 // negative value skips the interval-based trigger
                                    ? (
                                        timer(0, persistentSessionSavingInterval).pipe(
                                            tap((value) => logger.verbose("trigger: interval", value)),
                                        )
                                    )
                                    : of(null) // fired once to unblock the "combineLatest"
                            ),
                        ]).pipe(
                            filter(([loggedIn, persistentSession]) => persistentSession && loggedIn),
                            withLatestFrom(this.account$),
                        );
                    }),
                ).subscribe(async ([, {accountConfig}]) => {
                    const ipcMainAction = "saveProtonSession";
                    logger.verbose(ipcMainAction);
                    await this.ipcMainClient(ipcMainAction)({
                        login: accountConfig.login,
                        clientSession: await resolveLiveProtonClientSession(),
                        apiEndpointOrigin: this.core.parseEntryUrl(accountConfig, "proton-mail").sessionStorage.apiEndpointOrigin,
                    });
                }),
            );
        }
    }
}
