import {Actions, Effect} from "@ngrx/effects";
import {catchError, exhaustMap, filter, finalize, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {merge, Observable, of, Subject, throwError} from "rxjs";
import {Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {Timestamp} from "src/shared/types";
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
        const fetchers: Record<string, { stopNotifier$: Subject<never>, fetcher$: Observable<TutanotaApiFetchMessagesOutput> }> = {};

        return this.actions$.pipe(
            filter(ACCOUNTS_ACTIONS.is.ToggleFetching),
            switchMap(({payload}) => {
                const result = () => {
                    const fetchers$ = Object.values(fetchers).map(({fetcher$}) => fetcher$);
                    return merge(...fetchers$).pipe(mergeMap(() => []));
                };
                const cancelFetcher = () => {
                    const key = "login" in payload ? payload.login : payload.account.accountConfig.login;
                    if (fetchers[key]) {
                        fetchers[key].stopNotifier$.next();
                    }
                    delete fetchers[key];
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

                    const stopNotifier$ = new Subject<never>();
                    // TODO handle errors
                    // TODO enable interval
                    const fetcher$ = this.electronService.webViewCaller(webView, type, {finishPromise}).pipe(
                        exhaustMap((caller) => {
                            // TODO take "newestStoredTimestamp" from local database
                            const newestStoredTimestamp: Timestamp | undefined = undefined;
                            return caller("fetchMessages")({newestStoredTimestamp});
                        }),
                        tap((value) => {
                            // TODO submit item to database
                            // tslint:disable-next-line:no-console
                            console.log("fetched item", value);
                        }),
                        takeUntil(stopNotifier$),
                    );

                    fetchers[login] = {fetcher$, stopNotifier$};

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
                            this.electronService.webViewCaller(webView, type).pipe(
                                exhaustMap((caller) => caller("login")({login, password})),
                                mergeMap(() => []),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: false}}))),
                            ),
                        );
                    }

                    return this.electronService.webViewCaller(webView, type)
                        .pipe(
                            exhaustMap((caller) => caller("fillLogin")({login})),
                            mergeMap(() => []),
                        );
                }
                case "login2fa": {
                    const secret = payload.password || credentials.twoFactorCode;

                    if (secret) {
                        rateLimitingCheck(secret);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: true}})),
                            unreadReset,
                            this.electronService.webViewCaller(webView, type).pipe(
                                exhaustMap((caller) => caller("login2fa")({secret})),
                                mergeMap(() => []),
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
                            this.electronService.webViewCaller(webView, type).pipe(
                                exhaustMap((caller) => caller("unlock")({mailPassword})),
                                mergeMap(() => []),
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
        const notifications: Record<string, { stopNotifier$: Subject<never>, notification$: Observable<ReturnType<typeof ACCOUNTS_ACTIONS.NotificationPatch>> }> = {};

        return this.actions$.pipe(
            filter(ACCOUNTS_ACTIONS.is.SetupNotificationChannel),
            switchMap(({payload}) => {
                const {account, webView, finishPromise} = payload;
                const {type, login, entryUrl} = account.accountConfig;
                const stopNotifier$ = new Subject<never>();
                const notification$ = this.electronService.webViewCaller(webView, type, {finishPromise}).pipe(
                    exhaustMap((caller) => caller("notification")({entryUrl})),
                    map((notification) => ACCOUNTS_ACTIONS.NotificationPatch({account, notification})),
                    takeUntil(stopNotifier$),
                );

                finishPromise.then(() => {
                    stopNotifier$.next();
                    delete notifications[login];
                });

                notifications[login] = {stopNotifier$, notification$};

                return merge(...Object.values(notifications).map((item) => item.notification$));
            }),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        );
    })();

    constructor(private electronService: ElectronService,
                private actions$: Actions,
                private store: Store<State>) {}
}
