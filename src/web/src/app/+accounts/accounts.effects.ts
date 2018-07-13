import {Actions, Effect} from "@ngrx/effects";
import {catchError, exhaustMap, filter, finalize, map, mergeMap, switchMap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {merge, Observable, of, throwError} from "rxjs";
import {Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronExposure} from "src/shared/model/electron";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {Timestamp} from "src/shared/types";

const rateLimiter = ((window as any).__ELECTRON_EXPOSURE__ as ElectronExposure).requireNodeRollingRateLimiter();

@Injectable()
export class AccountsEffects {
    twoPerTenSecLimiter = rateLimiter({
        interval: ONE_SECOND_MS * 10,
        maxInInterval: 2,
    });

    @Effect()
    fetchMessages$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.FetchMessages),
        switchMap(({payload}) => {
            const {webView, account} = payload;

            if (account.accountConfig.type !== "tutanota") {
                return throwError(new Error("Not yet implemented"));
            }

            return this.electronService.webViewCaller(webView, account.accountConfig.type, {timeoutMs: 0}).pipe(
                exhaustMap((caller) => {
                    // TODO fill-in "newestStoredTimestamp" from local database
                    const newestStoredTimestamp: Timestamp | undefined = undefined;
                    return caller("fetchMessages")({newestStoredTimestamp});
                }),
                // tap((value) => {
                //     console.log("fetched item", value);
                // }),
                mergeMap(() => []),
            );
        }),
    );

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
            const unreadReset = of(ACCOUNTS_ACTIONS.NotificationPatch({login, notification: {unread: 0}}));

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
        const notifications: Array<Observable<ReturnType<typeof ACCOUNTS_ACTIONS.NotificationPatch>>> = [];

        return this.actions$.pipe(
            filter(ACCOUNTS_ACTIONS.is.SetupNotificationChannel),
            switchMap(({payload}) => {
                const {account, webView, unSubscribeOn} = payload;
                const {type, login, entryUrl} = account.accountConfig;
                const observable = this.electronService.webViewCaller(webView, type).pipe(
                    exhaustMap((caller) => caller("notification", {unSubscribeOn, timeoutMs: 0})({entryUrl})),
                    map((notification) => ACCOUNTS_ACTIONS.NotificationPatch({login, notification})),
                );

                if (unSubscribeOn) {
                    unSubscribeOn.then(() => {
                        notifications.splice(notifications.indexOf(observable), 1);
                    });
                }

                notifications.push(observable);

                return merge(...notifications);
            }),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        );
    })();

    constructor(private electronService: ElectronService,
                private actions$: Actions,
                private store: Store<State>) {}
}
