import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, Observable, concat, from, fromEvent, merge, of, race, throwError, timer} from "rxjs";
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

import {ACCOUNTS_ACTIONS, NOTIFICATION_ACTIONS, OPTIONS_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {FIRE_SYNCING_ITERATION$} from "src/web/browser-window/app/app.constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_MINUTE_MS, ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {getRandomInt, isDatabaseBootstrapped} from "src/shared/util";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/browser-window/util";

const {rollingRateLimiter} = __ELECTRON_EXPOSURE__;
const _logger = getZoneNameBoundWebLogger("[accounts.effects]");

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
                const {type, login} = payload.account.accountConfig;
                const resetNotificationsState$ = of(AccountsEffects.generateNotificationsStateResetAction(login));
                const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));
                const parsedEntryUrl = this.core.parseEntryUrl(payload.account.accountConfig);

                logger.info("setup");

                return merge(
                    // app set's app notification channel on webview.dom-ready event
                    // which means user is not logged-in yet at this moment, so resetting the state
                    resetNotificationsState$,
                    this.api.webViewClient(webView, type, {finishPromise}).pipe(
                        mergeMap((webViewClient) => {
                            return from(
                                webViewClient("notification")({...parsedEntryUrl, zoneName: logger.zoneName()}),
                            );
                        }),
                        withLatestFrom(this.store.pipe(select(AccountsSelectors.ACCOUNTS.pickAccount({login})))),
                        mergeMap(([notification, account]) => {
                            if (typeof notification.batchEntityUpdatesCounter === "number") {
                                FIRE_SYNCING_ITERATION$.next({type, login});
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
                const {type, login} = pk;
                const dispose$ = from(finishPromise).pipe(
                    tap(() => {
                        this.store.dispatch(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: false}, ignoreNoAccount: true}));
                        logger.info("dispose");
                    }),
                );
                const onlinePing$ = timer(0, ONE_SECOND_MS).pipe(
                    filter(() => navigator.onLine),
                );
                const notSyncingPing$ = timer(0, ONE_SECOND_MS).pipe(
                    switchMap(() => this.store.pipe(
                        select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                        filter((account) => Boolean(account && !account.progress.syncing)),
                    )),
                );
                const ipcMainClient = this.api.ipcMainClient();
                const zoneName = logger.zoneName();
                let bootstrappedOnce = false;

                logger.info("setup");

                return merge(
                    of(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: true}})),
                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                        filter(({payload: {key}}) => key.type === type && key.login === login),
                        mergeMap(({payload: {stat: {unread}}}) => of(ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: {unread}}}))),
                    ),
                    createEffect(
                        () => this.actions$.pipe(
                            unionizeActionFilter(ACCOUNTS_ACTIONS.is.SelectMailOnline),
                            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
                            filter(({payload: {pk: key}}) => key.type === type && key.login === login),
                            mergeMap(({payload: selectMailOnlineInput}) => concat(
                                of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {selectingMailOnline: true}})),
                                this.api.webViewClient(webView, type, {finishPromise}).pipe(
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
                    this.api.webViewClient(webView, type, {finishPromise}).pipe(
                        mergeMap((webViewClient) => merge(
                            timer(0, ONE_MINUTE_MS * 5).pipe(
                                tap(() => logger.verbose(`triggered by: timer`)),
                            ),
                            FIRE_SYNCING_ITERATION$.pipe(
                                filter((value) => value.type === type && value.login === login),
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
                            debounce(() => onlinePing$),
                            debounce(() => notSyncingPing$),
                            concatMap(() => {
                                return from(
                                    ipcMainClient("dbGetAccountMetadata")({type, login}),
                                );
                            }),
                            withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.timeouts))),
                            concatMap(([metadata, timeouts]) => {
                                const bootstrapping = !isDatabaseBootstrapped(metadata);

                                if (bootstrapping && bootstrappedOnce) {
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
                                        bootstrappedOnce,
                                    }),
                                );

                                this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: true}}));

                                const buildDbPatch$ = from(
                                    webViewClient("buildDbPatch", {timeoutMs})({
                                        type,
                                        login,
                                        zoneName,
                                        metadata: metadata as any, // TODO TS: get rid of typecasting
                                    }),
                                );
                                const result$ = buildDbPatch$.pipe(
                                    concatMap(() => EMPTY),
                                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                    finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                        login,
                                        patch: {syncing: false},
                                    }))),
                                );

                                if (bootstrapping) {
                                    bootstrappedOnce = true;
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
                const {type, login, credentials} = accountConfig;
                const pageType = notifications.pageType.type;
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

                logger.verbose(JSON.stringify({pageType}));

                switch (pageType) {
                    case "login": {
                        if (!credentials.password) {
                            logger.info("fillLogin");

                            return this.api.webViewClient(webView, type).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("fillLogin")({login, zoneName}),
                                    );
                                }),
                                mergeMap(() => of(ACCOUNTS_ACTIONS.Patch({login, patch: {loginFilledOnce: true}}))),
                                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                            );
                        }

                        const {loginDelaySecondsRange, loginDelayUntilSelected = false} = accountConfig;
                        const delayTriggers: Array<Observable<{ trigger: string }>> = [];
                        const buildLoginDelaysResetAction = () => ACCOUNTS_ACTIONS.Patch({
                            login,
                            patch: {loginDelayedSeconds: undefined, loginDelayedUntilSelected: undefined},
                        });

                        logger.info(`login delay configs: ${JSON.stringify({loginDelayUntilSelected, loginDelaySecondsRange})}`);

                        this.store.dispatch(buildLoginDelaysResetAction());

                        if (loginDelaySecondsRange) {
                            const {start, end} = loginDelaySecondsRange;
                            const delayTimeMs = getRandomInt(start, end) * ONE_SECOND_MS;

                            logger.info(`resolved login delay (ms): ${delayTimeMs}`);

                            delayTriggers.push(
                                merge(
                                    timer(delayTimeMs).pipe(
                                        map(() => ({trigger: `triggered on login delay expiration (ms): ${delayTimeMs}`})),
                                    ),
                                    timer(0, ONE_SECOND_MS).pipe(
                                        mergeMap((value) => {
                                            const loginDelayedSeconds = (delayTimeMs / ONE_SECOND_MS) - value;
                                            this.store.dispatch(
                                                ACCOUNTS_ACTIONS.Patch({login, patch: {loginDelayedSeconds}}),
                                            );
                                            return EMPTY;
                                        }),
                                    ),
                                ),
                            );
                        }

                        if (loginDelayUntilSelected) {
                            const bootstrap$ = account.loggedInOnce
                                ? of(true).pipe(
                                    tap(() => {
                                        // reset the account selection if has already been logged in bafore (got logged out from account)
                                        this.store.dispatch(ACCOUNTS_ACTIONS.DeActivate({login}));
                                    }),
                                    delay(ONE_SECOND_MS),
                                )
                                : of(true);

                            delayTriggers.push(
                                bootstrap$.pipe(
                                    mergeMap(() => merge(
                                        (() => {
                                            this.store.dispatch(
                                                ACCOUNTS_ACTIONS.Patch({login, patch: {loginDelayedUntilSelected: true}}),
                                            );
                                            return EMPTY;
                                        })(),
                                        this.store.pipe(
                                            select(AccountsSelectors.FEATURED.selectedLogin),
                                            filter((selectedLogin) => selectedLogin === login),
                                            // tslint:disable:max-line-length
                                            // delay handles the case if the app has no selected account and "on select" trigger gets disabled
                                            // if there is no selected account the app will select the account automatically
                                            // and previously setup "on select" trigger kicks in before it gets reset by new TryToLogin action
                                            // tslint:enable:max-line-length
                                            delay(ONE_SECOND_MS * 1.5),
                                            map(() => ({trigger: "triggered on account selection"})),
                                        ),
                                    )),
                                ),
                            );
                        }

                        const triggerDispose$ = race([
                            this.actions$.pipe(
                                unionizeActionFilter(ACCOUNTS_ACTIONS.is.TryToLogin),
                                filter(({payload: livePayload}) => {
                                    return payload.account.accountConfig.login === livePayload.account.accountConfig.login;
                                }),
                                map(({type: actionType}) => {
                                    return `another "${actionType}" action triggered`;
                                }),
                            ),
                            this.store.pipe(
                                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                                map((liveAccount) => {
                                    if (!liveAccount) {
                                        return `Account has been removed`;
                                    }
                                    if (liveAccount.notifications.pageType.type !== "login") {
                                        return `page type changed to ${JSON.stringify(liveAccount.notifications.pageType)}`;
                                    }
                                    if (liveAccount.progress.password) {
                                        return `"login" action performing is already in progress`;
                                    }
                                    return;
                                }),
                                filter((reason) => {
                                    return typeof reason === "string";
                                }),
                            ),
                        ]).pipe(
                            take(1),
                            tap((reason) => {
                                logger.info(`disposing delayed "login" action with the following reason: ${reason}`);
                            }),
                        );
                        const trigger$ = delayTriggers.length
                            ? race(delayTriggers).pipe(
                                take(1), // WARN: just one notification
                                takeUntil(triggerDispose$),
                            )
                            : of({trigger: "triggered immediate login (as no delays defined)"});
                        const executeLoginAction = (password: string) => {
                            rateLimitCheck(password);

                            logger.info("login");

                            return merge(
                                of(buildLoginDelaysResetAction()),
                                of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: true}})),
                                resetNotificationsState$,
                                this.api.webViewClient(webView, type).pipe(
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
                                    mergeMap(() => this.store.pipe(
                                        select(AccountsSelectors.FEATURED.selectedLogin),
                                        take(1),
                                        mergeMap((selectedLogin) => {
                                            if (selectedLogin) {
                                                return EMPTY;
                                            }
                                            // let's select the account if none has been selected
                                            return of(ACCOUNTS_ACTIONS.Activate({login}));
                                        }),
                                    )),
                                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                    finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: false}}))),
                                ),
                            );
                        };

                        return trigger$.pipe(
                            mergeMap(({trigger}) => this.store.pipe(
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
                                    logger.info(`login trigger: ${trigger})`);

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
                            this.api.webViewClient(webView, type).pipe(
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
                }

                logger.verbose("empty");

                return merge([]);
            })),
    );

    constructor(
        private api: ElectronService,
        private core: CoreService,
        private actions$: Actions<{ type: string; payload: any }>,
        private store: Store<State>,
    ) {}
}
