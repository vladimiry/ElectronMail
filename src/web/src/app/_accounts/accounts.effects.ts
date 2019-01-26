import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, Subject, from, fromEvent, merge, of, timer} from "rxjs";
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
    takeUntil,
    tap,
    withLatestFrom,
} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {AccountTypeAndLoginFieldContainer} from "src/shared/model/container";
import {AccountsSelectors, OptionsSelectors} from "src/web/src/app/store/selectors";
import {CoreService} from "src/web/src/app/_core/core.service";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const rateLimiter = __ELECTRON_EXPOSURE__.require["rolling-rate-limiter"]();
const _logger = getZoneNameBoundWebLogger("[accounts.effects]");

@Injectable()
export class AccountsEffects {
    private static generateNotificationsStateResetAction(login: string) {
        return ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: {unread: 0, loggedIn: false}}});
    }

    twoPerTenSecLimiter = rateLimiter({
        interval: ONE_SECOND_MS * 10,
        maxInInterval: 2,
    });

    fireSyncingIteration$ = new Subject<AccountTypeAndLoginFieldContainer>();

    @Effect()
    syncAccountsConfigs$ = this.actions$.pipe(
        unionizeActionFilter(OPTIONS_ACTIONS.is.GetSettingsResponse),
        map(({payload}) => ACCOUNTS_ACTIONS.WireUpConfigs({accountConfigs: payload.accounts})),
    );

    @Effect()
    setupNotificationChannel$ = this.actions$.pipe(
        unionizeActionFilter(ACCOUNTS_ACTIONS.is.SetupNotificationChannel),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        withLatestFrom(this.store.pipe(select(OptionsSelectors.FEATURED.electronLocations))),
        mergeMap(([{payload, logger}, electronLocations]) => {
            const {webView, finishPromise} = payload;
            const {type, login} = payload.account.accountConfig;
            const resetNotificationsState$ = of(AccountsEffects.generateNotificationsStateResetAction(login));
            const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));

            if (!electronLocations) {
                throw new Error(`Undefined electron context locations`);
            }

            const parsedEntryUrl = this.core.parseEntryUrl(payload.account.accountConfig, electronLocations);

            logger.info("setup");

            return merge(
                // app set's app notification channel on webview.dom-ready event
                // which means user is not logged-in yet at this moment, so resetting the state
                resetNotificationsState$,
                this.api.webViewClient(webView, type, {finishPromise}).pipe(
                    mergeMap((webViewClient) => webViewClient("notification")({...parsedEntryUrl, zoneName: logger.zoneName()})),
                    withLatestFrom(this.store.pipe(select(AccountsSelectors.ACCOUNTS.pickAccount({login})))),
                    mergeMap(([notification, account]) => {
                        if (typeof notification.batchEntityUpdatesCounter === "number") {
                            this.fireSyncingIteration$.next({type, login});
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
    );

    @Effect()
    toggleSyncing$ = this.actions$.pipe(
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
            const ipcMainClient = this.api.ipcMainClient();
            const zoneName = logger.zoneName();

            logger.info("setup");

            return merge(
                of(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: true}})),
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.mainProcessNotification),
                    filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                    filter(({payload: {key}}) => key.type === type && key.login === login),
                    mergeMap(({payload: {stat: {unread}}}) => of(ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: {unread}}}))),
                ),
                this.api.webViewClient(webView, type, {finishPromise}).pipe(
                    mergeMap((webViewClient) => merge(
                        timer(0, ONE_SECOND_MS * 60 * 3).pipe(
                            tap(() => logger.verbose(`triggered by: timer`)),
                        ),
                        this.fireSyncingIteration$.pipe(
                            filter((value) => value.type === type && value.login === login),
                            tap(() => logger.verbose(`triggered by: fireSyncingIteration$`)),
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
                        tap(() => {
                            this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: true}}));
                        }),
                        concatMap(() => ipcMainClient("dbGetAccountMetadata")({type, login})),
                        withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.timeouts))),
                        concatMap(([metadata, timeouts]) => {
                            return webViewClient("buildDbPatch", {timeoutMs: timeouts.fetching})({type, login, zoneName, metadata}).pipe(
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                            );
                        }),
                        mergeMap(() => of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: false}}))),
                    )),
                ),
            ).pipe(
                takeUntil(dispose$),
            );
        }),
    );

    @Effect()
    tryToLogin$ = this.actions$.pipe(
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
            const rateLimitingCheck = (password: string) => {
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
                    const password = payload.password || credentials.password;

                    if (password) {
                        rateLimitingCheck(password);

                        logger.info("login");
                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: true}})),
                            resetNotificationsState$,
                            this.api.webViewClient(webView, type).pipe(
                                mergeMap((webViewClient) => webViewClient("login")({login, password, zoneName})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: false}}))),
                            ),
                        );
                    }

                    logger.info("fillLogin");
                    return this.api.webViewClient(webView, type).pipe(
                        mergeMap((webViewClient) => webViewClient("fillLogin")({login, zoneName})),
                        mergeMap(() => of(ACCOUNTS_ACTIONS.Patch({login, patch: {loginFilledOnce: true}}))),
                        catchError((error) => of(CORE_ACTIONS.Fail(error))),
                    );
                }
                case "login2fa": {
                    const secret = payload.password || credentials.twoFactorCode;

                    // tslint:disable-next-line:early-exit
                    if (secret) {
                        rateLimitingCheck(secret);

                        logger.info("login2fa");
                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: true}})),
                            resetNotificationsState$,
                            this.api.webViewClient(webView, type).pipe(
                                mergeMap((webViewClient) => webViewClient("login2fa")({secret, zoneName})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: false}}))),
                            ),
                        );
                    }

                    break;
                }
                case "unlock": {
                    if (type !== "protonmail") {
                        throw new Error(
                            `Accounts with type "${type}" can't have action associated with the "${pageType}" page`,
                        );
                    }

                    const mailPassword = payload.password || ("mailPassword" in credentials && credentials.mailPassword);

                    // tslint:disable-next-line:early-exit
                    if (mailPassword) {
                        rateLimitingCheck(mailPassword);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: true}})),
                            resetNotificationsState$,
                            this.api.webViewClient(webView, type).pipe(
                                mergeMap((webViewClient) => webViewClient("unlock")({mailPassword, zoneName})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: false}}))),
                            ),
                        );
                    }

                    break;
                }
            }

            logger.verbose("empty");

            return merge([]);
        }));

    constructor(
        private api: ElectronService,
        private core: CoreService,
        private actions$: Actions<{ type: string; payload: any }>,
        private store: Store<State>,
    ) {}
}
