import {Actions, Effect} from "@ngrx/effects";
import {catchError, exhaustMap, filter, finalize, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {EMPTY, interval, merge, Observable, of, Subject, throwError} from "rxjs";
import {Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {TutanotaApiFetchMessagesOutput} from "src/shared/api/webview/tutanota";

const rateLimiter = window.__ELECTRON_EXPOSURE__.requireNodeRollingRateLimiter();

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
            switchMap(({payload}) => {
                const result = () => {
                    return merge(...Object.values(record).map(({observable$}) => observable$)).pipe(
                        catchError((error) => {
                            this.store.dispatch(CORE_ACTIONS.Fail(error));
                            return EMPTY;
                        }),
                    );
                };
                const cancelFetcher = () => {
                    const key = "login" in payload ? payload.login : payload.account.accountConfig.login;
                    if (record[key]) {
                        record[key].stop$.next();
                    }
                    delete record[key];
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

                    const stop$ = new Subject<never>();
                    const fetchAndPersist$ = this.electron.webViewClient(webView, type, {finishPromise}).pipe(
                        switchMap((client) => {
                            // TODO take "newestStoredTimestamp" from local database
                            const newestStoredTimestamp = undefined;
                            // TODO handle network errors during fetching, test for online status
                            return client("fetchMessages")({type, login, newestStoredTimestamp}).pipe(
                                tap(({mail}) => {
                                    // TODO release: disable console.log stuff
                                    // tslint:disable-next-line:no-console
                                    console.log("fetchMessages", {id: mail.id}, mail);
                                }),
                            );
                        }),
                        switchMap((value) => this.electron.ipcMainClient()("databaseUpsert")({table: "Mail", data: [value.mail]}).pipe(
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
        switchMap(({payload}) => {
            const {account, webView} = payload;
            const {accountConfig, notifications} = account;
            const {type, login, credentials} = accountConfig;
            const pageType = notifications.pageType.type;
            const unreadReset = of(ACCOUNTS_ACTIONS.NotificationPatch({account, notification: {unread: 0}}));

            // TODO make sure passwords submitting looping doesn't happen, until then a workaround is enabled below
            const rateLimitingCheck = (password: string) => {
                const key = String([login, pageType, password]);
                const timeLeft = this.twoPerTenSecLimiter(key);

                if (timeLeft > 0) {
                    throw new Error([
                        `It's not allowed to submit the same password for the same "${login}" account`,
                        `more than 2 times per 10 seconds (page type: "${pageType}").`,
                        `Make sure that your password is valid.`,
                        `Auto login feature is disable until app restarted.`,
                    ].join(" "));
                }
            };

            switch (pageType) {
                case "login": {
                    const password = payload.password || credentials.password;

                    if (password) {
                        rateLimitingCheck(password);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: true}})),
                            unreadReset,
                            this.electron.webViewClient(webView, type).pipe(
                                switchMap((caller) => caller("login")({login, password})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: false}}))),
                            ),
                        );
                    }

                    return this.electron.webViewClient(webView, type)
                        .pipe(
                            switchMap((caller) => caller("fillLogin")({login})),
                            mergeMap(() => EMPTY),
                        );
                }
                case "login2fa": {
                    const secret = payload.password || credentials.twoFactorCode;

                    if (secret) {
                        rateLimitingCheck(secret);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: true}})),
                            unreadReset,
                            this.electron.webViewClient(webView, type).pipe(
                                switchMap((caller) => caller("login2fa")({secret})),
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

                    if (mailPassword) {
                        rateLimitingCheck(mailPassword);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: true}})),
                            unreadReset,
                            this.electron.webViewClient(webView, type).pipe(
                                switchMap((caller) => caller("unlock")({mailPassword})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: false}}))),
                            ),
                        );
                    }

                    break;
                }
            }

            return merge([]);
        }));

    @Effect()
    setupNotificationChannel$ = (() => {
        // tslint:disable-next-line:max-line-length
        const record: Record<string, { stop$: Subject<never>, notification$: Observable<ReturnType<typeof ACCOUNTS_ACTIONS.NotificationPatch>> }> = {};

        return this.actions$.pipe(
            filter(ACCOUNTS_ACTIONS.is.SetupNotificationChannel),
            switchMap(({payload}) => {
                const {account, webView, finishPromise} = payload;
                const {type, login, entryUrl} = account.accountConfig;
                const stop$ = new Subject<never>();
                const notification$ = this.electron.webViewClient(webView, type, {finishPromise}).pipe(
                    switchMap((caller) => caller("notification")({entryUrl})),
                    map((notification) => ACCOUNTS_ACTIONS.NotificationPatch({account, notification})),
                    takeUntil(stop$),
                );

                finishPromise.then(() => {
                    stop$.next();
                    delete record[login];
                });

                record[login] = {stop$, notification$};

                return merge(...Object.values(record).map((item) => item.notification$));
            }),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        );
    })();

    constructor(private electron: ElectronService,
                private actions$: Actions,
                private store: Store<State>) {}
}
