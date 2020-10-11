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
import {serializeError} from "serialize-error";

import {ACCOUNTS_ACTIONS, NOTIFICATION_ACTIONS, OPTIONS_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {FIRE_SYNCING_ITERATION$} from "src/web/browser-window/app/app.constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_MINUTE_MS, ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {consumeMemoryRateLimiter, isDatabaseBootstrapped} from "src/shared/util";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/browser-window/util";

// TODO get rid of require "rate-limiter-flexible/lib/RateLimiterMemory" import
//      ES import makes the build fail in "web" context since webpack attempts to bundle the whole library which requires "node" context
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const RateLimiterMemory: typeof import("rate-limiter-flexible")["RateLimiterMemory"]
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    = require("rate-limiter-flexible/lib/RateLimiterMemory");

const _logger = getZoneNameBoundWebLogger("[accounts.effects]");

const pingOnlineStatusEverySecond$ = timer(0, ONE_SECOND_MS).pipe(
    filter(() => navigator.onLine),
);

@Injectable()
export class AccountsEffects {
    private readonly loginRateLimiterOptions = {
        points: 2,
        duration: 10, // seconds value
    } as const

    private readonly loginRateLimiter = new RateLimiterMemory(this.loginRateLimiterOptions)

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
                const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));
                const parsedEntryUrlBundle = this.core.parseEntryUrl(payload.account.accountConfig, "proton-mail");

                logger.info("setup");

                return merge(
                    // app set's app notification channel on webview.dom-ready event
                    // which means user is not logged-in yet at this moment, so resetting the state
                    of(this.accountsService.generateNotificationsStateResetAction({login})),

                    this.api.webViewClient(webView, {finishPromise}).pipe(
                        mergeMap((webViewClient) => {
                            return from(
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

                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbAttachmentExportRequest),
                        filter(({payload: {key}}) => key.login === login),
                        mergeMap(({payload}) => {
                            // TODO live attachments export: fire error if offline or not signed-in into the account
                            return this.api.webViewClient(webView, {finishPromise}).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("exportMailAttachments", {timeoutMs: payload.timeoutMs})({
                                            uuid: payload.uuid,
                                            mailPk: payload.mailPk,
                                            login: payload.key.login,
                                            zoneName: logger.zoneName(),
                                        }),
                                    );
                                }),
                                catchError((error) => {
                                    return from(
                                        this.api.ipcMainClient()("dbExportMailAttachmentsNotification")({
                                            uuid: payload.uuid,
                                            accountPk: {login},
                                            attachments: [], // stub data
                                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                                            serializedError: serializeError(error),
                                        })
                                    ).pipe(
                                        mergeMap(() => throwError(error)),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                            );
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
                        mergeMap(({payload}) => of(ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: {unread: payload.stat.unread}}}))),
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
                        mergeMap((webViewClient) => {
                            const syncingIterationTrigger$: Observable<null> = merge(
                                timer(0, ONE_MINUTE_MS * 5).pipe(
                                    tap(() => logger.verbose(`triggered by: timer`)),
                                    map(() => null),
                                ),
                                fromEvent(window, "online").pipe(
                                    tap(() => logger.verbose(`triggered by: "window.online" event`)),
                                    delay(ONE_SECOND_MS * 3),
                                    map(() => null),
                                ),
                                FIRE_SYNCING_ITERATION$.pipe(
                                    filter((value) => value.login === login),
                                    tap(() => logger.verbose(`triggered by: FIRE_SYNCING_ITERATION$`)),
                                    // user might be moving emails from here to there while syncing/"buildDbPatch" cycle is in progress
                                    // debounce call reduces 404 fetch errors as we don't trigger fetching until user got settled down
                                    debounceTime(ONE_SECOND_MS * 3),
                                ),
                            ).pipe(
                                map(() => null),
                            );

                            return syncingIterationTrigger$.pipe(
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

                                    const result$ = from(
                                        webViewClient("buildDbPatch", {timeoutMs})({
                                            login,
                                            zoneName,
                                            metadata,
                                        }),
                                    ).pipe(
                                        concatMap(() => of(ACCOUNTS_ACTIONS.Synced({pk: {login}}))),
                                        takeUntil(
                                            fromEvent(window, "offline").pipe(
                                                tap(() => {
                                                    logger.verbose(`offline event`);

                                                    // tslint:disable-next-line:early-exit
                                                    if (bootstrapping && bootstrappingTriggeredOnce) {
                                                        bootstrappingTriggeredOnce = false;
                                                        logger.verbose(
                                                            [
                                                                `reset "bootstrappingTriggeredOnce" state as previous iteration`,
                                                                `got aborted by the "offline" event`,
                                                            ].join(" "),
                                                        );
                                                    }
                                                }),
                                            ),
                                        ),
                                        catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                                        finalize(() => {
                                            this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: false}}));
                                        }),
                                    );

                                    if (bootstrapping) {
                                        bootstrappingTriggeredOnce = true;
                                        logger.verbose("bootstrappingTriggeredOnce = true");
                                    }

                                    return result$;
                                }),
                            );
                        }),
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
                const resetNotificationsState$ = of(this.accountsService.generateNotificationsStateResetAction({login}));
                const zoneName = logger.zoneName();

                // TODO improve login submitting looping prevention
                const rateLimitCheck = async (password: string): Promise<void> => {
                    const key = String([login, pageType, password]);
                    const {waitTimeMs} = await consumeMemoryRateLimiter(
                        async () => this.loginRateLimiter.consume(key),
                    );
                    // tslint:disable-next-line:early-exit
                    if (waitTimeMs > 0) {
                        const {points, duration} = this.loginRateLimiterOptions;
                        throw new Error([
                            `It's not allowed to submit the same password for the same account`,
                            `more than ${points} times per ${duration} milliseconds (${JSON.stringify({pageType, waitTimeMs})}).`,
                            `Make sure that your login/password is correct.`,
                            `Auto login feature is disable until app restarted.`,
                        ].join(" "));
                    }
                };

                logger.verbose(JSON.stringify({pageType, skipLoginDelayLogic}));

                switch (pageType) {
                    case "login": {
                        const onlyFillLoginAction = (): Observable<import("@ngrx/store").Action> => {
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
                                ),
                            );
                        };
                        const fullLoginAction = (): Observable<import("@ngrx/store").Action> => {
                            const executeLoginAction = (password: string): Observable<import("@ngrx/store").Action> => {
                                logger.info("login");

                                const action$ = merge(
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
                                        finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                            login,
                                            patch: {password: false}
                                        }))),
                                    ),
                                );

                                return from(
                                    rateLimitCheck(password),
                                ).pipe(
                                    concatMap(() => action$),
                                );
                            };
                            const trigger$: Observable<{ trigger: string }> = skipLoginDelayLogic
                                ? of({trigger: "the delay already took place, so immediate resolve"})
                                : this.accountsService.setupLoginDelayTrigger({login}, logger);

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
                        };

                        return from(
                            // TODO handle the edge case of user to be very fast with manual login form submitting
                            //      in such case there is a possibility that we "resetProtonBackendSession" after the form got submitted
                            //      and so the app might potentially reset the cookies set after the fast manual login
                            this.api.ipcMainClient()("resetProtonBackendSession")({login}),
                        ).pipe(
                            mergeMap(() => {
                                if (!credentials.password) {
                                    return onlyFillLoginAction();
                                }
                                return fullLoginAction();
                            }),
                        );
                    }
                    case "login2fa": {
                        const {twoFactorCode: secret} = credentials;

                        if (!secret) {
                            break;
                        }

                        const action$ = merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: true}})),
                            resetNotificationsState$,
                            this.api.webViewClient(webView).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("login2fa")({secret, zoneName}),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: false}}))),
                            ),
                        );

                        logger.info("login2fa");

                        return from(
                            rateLimitCheck(secret),
                        ).pipe(
                            concatMap(() => action$),
                        );
                    }
                    case "unlock": {
                        const mailPassword = "mailPassword" in credentials && credentials.mailPassword;

                        if (!mailPassword) {
                            break;
                        }

                        const action$ = merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: true}})),
                            resetNotificationsState$,
                            // TODO TS: resolve "webViewClient" calling "this.api.webViewClient" as normally
                            of(__ELECTRON_EXPOSURE__.buildIpcWebViewClient(webView)).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("unlock")({mailPassword, zoneName}),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: false}}))),
                            ),
                        );

                        logger.info("unlock");

                        return from(
                            rateLimitCheck(mailPassword),
                        ).pipe(
                            concatMap(() => action$),
                        );
                    }
                }

                logger.verbose("empty");

                return [];
            }),
        ),
    );

    constructor(
        private readonly actions$: Actions<{
            type: string;
            payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        }>,
        private readonly api: ElectronService,
        private readonly core: CoreService,
        private readonly store: Store<State>,
        private readonly accountsService: AccountsService,
    ) {}
}
