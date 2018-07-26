import {Actions, Effect} from "@ngrx/effects";
import {catchError, concatMap, exhaustMap, filter, finalize, map, mergeMap, takeUntil, tap} from "rxjs/operators";
import {EMPTY, interval, merge, Observable, of, Subject, throwError} from "rxjs";
import {Injectable} from "@angular/core";
import {Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {TutanotaApiFetchMessagesOutput} from "src/shared/api/webview/tutanota";

const _logger = getZoneNameBoundWebLogger("[accounts.effects]");
const rateLimiter = __ELECTRON_EXPOSURE__.require["rolling-rate-limiter"]();

@Injectable()
export class AccountsEffects {
    twoPerTenSecLimiter = rateLimiter({
        interval: ONE_SECOND_MS * 10,
        maxInInterval: 2,
    });

    @Effect()
    toggleFetching$ = (() => {
        const record: Record<string, { stop$: Subject<never>, observable$: Observable<TutanotaApiFetchMessagesOutput> }> = {};

        return this.actions$.pipe(
            filter(ACCOUNTS_ACTIONS.is.ToggleFetching),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload, logger}) => {
                const result = () => {
                    const observables = Object.values(record).map(({observable$}) => observable$);
                    return merge(...observables).pipe(
                        catchError((error) => {
                            this.store.dispatch(CORE_ACTIONS.Fail(error));
                            return EMPTY;
                        }),
                    );
                };
                const cancelFetcher = () => {
                    const key = "login" in payload ? payload.login : payload.account.accountConfig.login;
                    if (!(key in record)) {
                        return;
                    }
                    record[key].stop$.next();
                    delete record[key];
                    logger.verbose("release");
                };

                cancelFetcher();

                // TODO TS: define this condition as "disabled" variable
                // currently TS doesn't properly understand a type guard being defined as variable.
                if (!("account" in payload)
                    || !payload.account.notifications.loggedIn
                    || !payload.account.accountConfig.storeMails) {
                    return result();
                }

                return (({account, webView, finishPromise}) => {
                    const {login, type} = account.accountConfig;

                    if (type !== "tutanota") {
                        return throwError(new Error(`Messages fetching is not yet implemented for "${type}" email provider`));
                    }

                    // TODO stop$ notifier doesn't seem to needed, "finishPromise" completes an observable
                    const stop$ = new Subject<never>();
                    const fetchAndPersist$ = this.electron.webViewClient(webView, type, {finishPromise}).pipe(
                        concatMap((client) => {
                            // TODO take "newestStoredTimestamp" from local database
                            const newestStoredTimestamp = undefined;
                            // TODO handle network errors during fetching, test for online status
                            return client("fetchMessages")({type, login, newestStoredTimestamp, zoneName: logger.zoneName()}).pipe(
                                tap(({mail}) => {
                                    // TODO release: disable console.log stuff
                                    // tslint:disable-next-line:no-console
                                    console.log("fetchMessages", {id: mail.id}, mail);
                                }),
                            );
                        }),
                        concatMap((value) => this.electron.ipcMainClient()("databaseUpsert")({table: "Mail", data: [value.mail]}).pipe(
                            tap(() => {
                                // TODO release: disable console.log stuff
                                // tslint:disable-next-line:no-console
                                console.log("databaseUpsert", {id: value.mail.id}, value.mail);
                            }),
                            map(() => value),
                        )),
                        takeUntil(stop$),
                    );
                    // TODO release: increase interval time to 30 minutes
                    // TODO make interval time configurable
                    const buildIntervalObservable = (): Observable<TutanotaApiFetchMessagesOutput> => interval(ONE_SECOND_MS * 30).pipe(
                        // TODO skip "fetchAndPersist$" if previous action is still in progress (introduce "progress" state per account)
                        exhaustMap(() => fetchAndPersist$),
                        takeUntil(stop$),
                    );

                    record[login] = {
                        observable$: buildIntervalObservable(),
                        stop$,
                    };
                    logger.verbose("add");

                    // account removing case (triggered in component's "ngOnDestroy" life-cycle function)
                    finishPromise.then(cancelFetcher);

                    return result();
                })(payload);
            }),
        );
    })();

    @Effect()
    syncAccountsConfigs$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.GetSettingsResponse),
        map(({payload}) => ACCOUNTS_ACTIONS.WireUpConfigs({accountConfigs: payload.accounts})),
    );

    @Effect()
    tryToLogin$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.TryToLogin),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload, logger}) => {
            const {account, webView} = payload;
            const {accountConfig, notifications} = account;
            const {type, login, credentials} = accountConfig;
            const pageType = notifications.pageType.type;
            const unreadReset = of(ACCOUNTS_ACTIONS.NotificationPatch({login, notification: {unread: 0}}));

            // TODO make sure passwords submitting looping doesn't happen, until then a workaround is enabled below
            const rateLimitingCheck = (password: string) => {
                const key = String([login, pageType, password]);
                const timeLeft = this.twoPerTenSecLimiter(key);

                // tslint:disable-next-line:early-exit
                if (timeLeft > 0) {
                    throw new Error([
                        `It's not allowed to submit the same password for the same "${login}" account`,
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
                            unreadReset,
                            this.electron.webViewClient(webView, type).pipe(
                                mergeMap((caller) => caller("login")({login, password, zoneName: logger.zoneName()})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: false}}))),
                            ),
                        );
                    }

                    logger.info("fillLogin");
                    return this.electron.webViewClient(webView, type).pipe(
                        mergeMap((caller) => caller("fillLogin")({login, zoneName: logger.zoneName()})),
                        mergeMap(() => EMPTY),
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
                            unreadReset,
                            this.electron.webViewClient(webView, type).pipe(
                                mergeMap((caller) => caller("login2fa")({secret, zoneName: logger.zoneName()})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                    login, patch: {twoFactorCode: false},
                                }))),
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
                            unreadReset,
                            this.electron.webViewClient(webView, type).pipe(
                                mergeMap((caller) => caller("unlock")({mailPassword, zoneName: logger.zoneName()})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                    login, patch: {mailPassword: false},
                                }))),
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
        private electron: ElectronService,
        private actions$: Actions,
        private store: Store<State>,
    ) {}
}
