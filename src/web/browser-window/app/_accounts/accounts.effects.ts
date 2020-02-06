import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, Observable, concat, from, fromEvent, merge, of, throwError, timer} from "rxjs";
import {Injectable} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {
    catchError,
    concatMap,
    debounce,
    debounceTime,
    delay,
    filter,
    finalize,
    map,
    mergeMap,
    switchMap,
    take,
    takeUntil,
    tap,
    withLatestFrom,
} from "rxjs/operators";
import {subscribableLikeToObservable} from "electron-rpc-api";

import {ACCOUNTS_ACTIONS, NOTIFICATION_ACTIONS, OPTIONS_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {FIRE_SYNCING_ITERATION$} from "src/web/browser-window/app/app.constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_MINUTE_MS, ONE_SECOND_MS} from "src/shared/constants";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/primary";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/browser-window/util";
import {isDatabaseBootstrapped} from "src/shared/util";

const {rollingRateLimiter} = __ELECTRON_EXPOSURE__;

const _logger = getZoneNameBoundWebLogger("[accounts.effects]");

const pingOnlineStatusEverySecond$ = timer(0, ONE_SECOND_MS).pipe(
    filter(() => navigator.onLine),
);

@Injectable()
export class AccountsEffects {
    private static generateNotificationsStateResetAction(login: string) {
        return ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: {unread: 0, loggedIn: false}}});
    }

    twoPerTenSecLimiter = rollingRateLimiter({
        interval: ONE_SECOND_MS * 10,
        maxInInterval: 2,
    });

    syncAccountsConfigs$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.GetSettingsResponse),
            map(({payload}) => ACCOUNTS_ACTIONS.WireUpConfigs({accountConfigs: payload.accounts})),
        ),
    );

    setupNotificationChannel$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(ACCOUNTS_ACTIONS.is.SetupNotificationChannel),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload, logger}) => {
                const {webView, finishPromise} = payload;
                const {login} = payload.account.accountConfig;
                const resetNotificationsState$ = of(AccountsEffects.generateNotificationsStateResetAction(login));
                const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));

                const parsedEntryUrlBundle = this.core.parseEntryUrl(payload.account.accountConfig, "WebClient");

                logger.info("setup");

                return merge(
                    // app set's app notification channel on webview.dom-ready event
                    // which means user is not logged-in yet at this moment, so resetting the state
                    resetNotificationsState$,
                    this.api.webViewClient(webView, {finishPromise}).pipe(
                        mergeMap((webViewClient) => {
                            return subscribableLikeToObservable(
                                webViewClient("notification")({...parsedEntryUrlBundle, zoneName: logger.zoneName()}),
                            );
                        }),
                        withLatestFrom(this.store.pipe(select(AccountsSelectors.ACCOUNTS.pickAccount({login})))),
                        mergeMap(([notification, account]) => {
                            if (typeof notification.batchEntityUpdatesCounter !== "undefined") {
                                FIRE_SYNCING_ITERATION$.next({login});
                                return EMPTY;
                            }

                            // app derives "unread" value form the database in case of activated database syncing
                            // so "unread" notification should be ignored
                            if (account && account.syncingActivated && typeof notification.unread === "number") {
                                return EMPTY;
                            }

                            return of(ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: notification}}));
                        }),
                    ),
                ).pipe(
                    takeUntil(dispose$),
                );
            }),
        ),
    );

    toggleSyncing$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(ACCOUNTS_ACTIONS.is.ToggleSyncing),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload, logger}) => {
                const {pk, webView, finishPromise} = payload;
                const {login} = pk;
                const dispose$ = from(finishPromise).pipe(
                    tap(() => {
                        this.store.dispatch(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: false}, ignoreNoAccount: true}));
                        logger.info("dispose");
                    }),
                );
                const notSyncingPing$ = timer(0, ONE_SECOND_MS).pipe(
                    switchMap(() => this.store.pipe(
                        select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                        filter((account) => Boolean(account && !account.progress.syncing)),
                    )),
                );
                const ipcMainClient = this.api.ipcMainClient();
                const zoneName = logger.zoneName();
                let bootstrappingTriggeredOnce = false;

                logger.info("setup");

                return merge(
                    of(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: true}})),
                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                        filter(({payload: {key}}) => key.login === login),
                        mergeMap(({payload: {stat: {unread}}}) => of(ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: {unread}}}))),
                    ),
                    createEffect(
                        () => this.actions$.pipe(
                            unionizeActionFilter(ACCOUNTS_ACTIONS.is.SelectMailOnline),
                            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
                            filter(({payload: {pk: key}}) => key.login === login),
                            mergeMap(({payload: selectMailOnlineInput}) => concat(
                                of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {selectingMailOnline: true}})),
                                this.api.webViewClient(webView, {finishPromise}).pipe(
                                    mergeMap((webViewClient) => {
                                        const selectMailOnlineInput$ = from(
                                            webViewClient("selectMailOnline", {timeoutMs: ONE_SECOND_MS * 5})({
                                                ...selectMailOnlineInput,
                                                zoneName,
                                            }),
                                        );
                                        return selectMailOnlineInput$.pipe(
                                            mergeMap(() => EMPTY),
                                            catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                            finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                                login,
                                                patch: {selectingMailOnline: false},
                                            }))),
                                        );
                                    }),
                                ),
                            )),
                        ),
                    ),
                    this.api.webViewClient(webView, {finishPromise}).pipe(
                        mergeMap((webViewClient) => merge(
                            timer(0, ONE_MINUTE_MS * 5).pipe(
                                tap(() => logger.verbose(`triggered by: timer`)),
                            ),
                            FIRE_SYNCING_ITERATION$.pipe(
                                filter((value) => value.login === login),
                                tap(() => logger.verbose(`triggered by: FIRE_SYNCING_ITERATION$`)),
                                // user might be moving emails from here to there while syncing/"buildDbPatch" cycle is in progress
                                // debounce call reduces 404 fetch errors as we don't trigger fetching until user got settled down
                                debounceTime(ONE_SECOND_MS * 3),
                            ),
                            fromEvent(window, "online").pipe(
                                tap(() => logger.verbose(`triggered by: "window.online" event`)),
                                delay(ONE_SECOND_MS * 3),
                            ),
                        ).pipe(
                            debounceTime(ONE_SECOND_MS),
                            debounce(() => pingOnlineStatusEverySecond$),
                            debounce(() => notSyncingPing$),
                            concatMap(() => {
                                return from(
                                    ipcMainClient("dbGetAccountMetadata")({login}),
                                );
                            }),
                            withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.timeouts))),
                            concatMap(([metadata, timeouts]) => {
                                const bootstrapping = !isDatabaseBootstrapped(metadata);

                                if (bootstrapping && bootstrappingTriggeredOnce) {
                                    return throwError(
                                        new Error(`Database bootstrap fetch has already been called once for the account, ${zoneName}`),
                                    );
                                }

                                const timeoutMs = bootstrapping
                                    ? timeouts.dbBootstrapping
                                    : timeouts.dbSyncing;

                                logger.verbose(
                                    `calling "buildDbPatch" api`,
                                    JSON.stringify({
                                        timeoutMs,
                                        bootstrapping,
                                        bootstrappingTriggeredOnce,
                                    }),
                                );

                                this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: true}}));

                                const result$ = subscribableLikeToObservable(
                                    webViewClient("buildDbPatch", {timeoutMs})({
                                        login,
                                        zoneName,
                                        metadata,
                                    }),
                                ).pipe(
                                    concatMap(() => EMPTY),
                                    takeUntil(
                                        fromEvent(window, "offline").pipe(
                                            tap(() => {
                                                logger.verbose(`offline event`);

                                                // tslint:disable-next-line:early-exit
                                                if (bootstrapping && bootstrappingTriggeredOnce) {
                                                    bootstrappingTriggeredOnce = false;
                                                    logger.verbose(
                                                        [
                                                            `reset "bootstrappingTriggeredOnce" state as previous iteration got aborted`,
                                                            `by the "offline" event`,
                                                        ].join(" "),
                                                    );
                                                }
                                            }),
                                        ),
                                    ),
                                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                    finalize(() => {
                                        return this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: false}}));
                                    }),
                                );

                                if (bootstrapping) {
                                    bootstrappingTriggeredOnce = true;
                                    logger.verbose("bootstrappingTriggeredOnce = true");
                                }

                                return result$;
                            }),
                        )),
                    ),
                ).pipe(
                    takeUntil(dispose$),
                );
            }),
        ),
    );

    tryToLogin$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(ACCOUNTS_ACTIONS.is.TryToLogin),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload, logger}) => {
                const {account, webView} = payload;
                const {accountConfig, notifications} = account;
                const {login, credentials} = accountConfig;
                const {type: pageType, skipLoginDelayLogic} = notifications.pageType;
                const resetNotificationsState$ = of(AccountsEffects.generateNotificationsStateResetAction(login));
                const zoneName = logger.zoneName();

                // TODO make sure passwords submitting looping doesn't happen, until then a workaround is enabled below
                const rateLimitCheck = (password: string) => {
                    const key = String([login, pageType, password]);
                    const timeLeft = this.twoPerTenSecLimiter(key);

                    // tslint:disable-next-line:early-exit
                    if (timeLeft > 0) {
                        throw new Error([
                            `It's not allowed to submit the same password for the same account`,
                            `more than 2 times per 10 seconds (page type: "${pageType}").`,
                            `Make sure that your password is valid.`,
                            `Auto login feature is disable until app restarted.`,
                        ].join(" "));
                    }
                };

                logger.verbose(JSON.stringify({pageType, skipLoginDelayLogic}));

                switch (pageType) {
                    case "login": {
                        if (!credentials.password) {
                            logger.info("fillLogin");

                            return merge(
                                of(this.accountsService.buildLoginDelaysResetAction({login})),
                                this.api.webViewClient(webView).pipe(
                                    mergeMap((webViewClient) => {
                                        return from(
                                            webViewClient("fillLogin")({login, zoneName}),
                                        );
                                    }),
                                    mergeMap(() => of(ACCOUNTS_ACTIONS.Patch({login, patch: {loginFilledOnce: true}}))),
                                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                ),
                            );
                        }

                        const executeLoginAction = (password: string) => {
                            rateLimitCheck(password);

                            logger.info("login");

                            return merge(
                                of(this.accountsService.buildLoginDelaysResetAction({login})),
                                of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: true}})),
                                resetNotificationsState$,
                                this.api.webViewClient(webView).pipe(
                                    delay(
                                        account.loggedInOnce
                                            ? ONE_SECOND_MS
                                            : 0,
                                    ),
                                    mergeMap((webViewClient) => {
                                        return from(
                                            webViewClient("login")({login, password, zoneName}),
                                        );
                                    }),
                                    mergeMap(() => EMPTY),
                                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                    finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: false}}))),
                                ),
                            );
                        };

                        const trigger$: Observable<{ trigger: string }> = skipLoginDelayLogic
                            ? of({trigger: "the delay already took place, so immediate resolve"})
                            : this.accountsService.setupLoginDelayTrigger(account, logger);

                        return trigger$.pipe(
                            mergeMap(() => this.store.pipe(
                                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                                // WARN: do not react to every account change notification
                                // but only reaction to just pick the up to date password (it can be changed during login delay)
                                // otherwise multiple login form submitting attempts can happen
                                take(1),
                                mergeMap((value) => {
                                    if (!value) {
                                        // early skipping if account got removed during login delay
                                        logger.info("account got removed during login delaying?");
                                        return EMPTY;
                                    }
                                    return [{password: value.accountConfig.credentials.password}];
                                }),
                                mergeMap(({password}) => {
                                    if (!password) {
                                        logger.info("login action canceled due to the empty password");
                                        return EMPTY;
                                    }

                                    return executeLoginAction(password);
                                }),
                            )),
                        );
                    }
                    case "login2fa": {
                        const {twoFactorCode: secret} = credentials;

                        if (!secret) {
                            break;
                        }

                        rateLimitCheck(secret);

                        logger.info("login2fa");

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: true}})),
                            resetNotificationsState$,
                            this.api.webViewClient(webView).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("login2fa")({secret, zoneName}),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: false}}))),
                            ),
                        );
                    }
                    case "unlock": {
                        const mailPassword = "mailPassword" in credentials && credentials.mailPassword;

                        if (!mailPassword) {
                            break;
                        }

                        rateLimitCheck(mailPassword);

                        logger.info("unlock");

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: true}})),
                            resetNotificationsState$,
                            // TODO TS: resolve "webViewClient" calling "this.api.webViewClient" as normally
                            of(PROTONMAIL_IPC_WEBVIEW_API.client(webView)).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("unlock")({mailPassword, zoneName}),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: false}}))),
                            ),
                        );
                    }
                }

                logger.verbose("empty");

                return [];
            })),
    );

    constructor(
        private readonly actions$: Actions<{ type: string; payload: any }>,
        private readonly api: ElectronService,
        private readonly core: CoreService,
        private readonly store: Store<State>,
        private readonly accountsService: AccountsService,
    ) {}
}
