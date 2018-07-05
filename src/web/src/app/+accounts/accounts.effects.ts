import {Actions, Effect} from "@ngrx/effects";
import {catchError, filter, finalize, map, mergeMap, switchMap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {merge, Observable, of} from "rxjs";
import {Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS} from "_@web/src/app/store/actions";
import {ElectronExposure} from "_@shared/model/electron";
import {ElectronService} from "_@web/src/app/+core/electron.service";
import {State} from "_@web/src/app/store/reducers/accounts";

const rateLimiter = ((window as any).__ELECTRON_EXPOSURE__ as ElectronExposure).requireNodeRollingRateLimiter();

@Injectable()
export class AccountsEffects {
    twoPerTenSecLimiter = rateLimiter({
        interval: 1000 * 10,
        maxInInterval: 2,
    });

    @Effect()
    syncAccountsConfigs$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.GetSettingsResponse),
        map(({payload}) => ACCOUNTS_ACTIONS.WireUpConfigs({accountConfigs: payload.accounts})),
    );

    @Effect()
    accountLogin$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.Login),
        switchMap(({payload}) => {
            const {account, webView} = payload;
            const {accountConfig} = account;
            const {type: accountType, login} = accountConfig;
            const pageType = account.notifications.pageType.type;
            const unreadReset = of(ACCOUNTS_ACTIONS.NotificationPatch({accountConfig, notification: {unread: 0}}));

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
                    const password = payload.password || accountConfig.credentials.password;

                    if (password) {
                        rateLimitingCheck(password);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: true}})),
                            unreadReset,
                            this.electronService
                                .webViewCaller(webView, accountType)("login")({login, password})
                                .pipe(
                                    mergeMap(() => []),
                                    catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                    finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                        login, patch: {password: false},
                                    }))),
                                ),
                        );
                    }

                    return this.electronService
                        .webViewCaller(webView, accountType)("fillLogin")({login})
                        .pipe(mergeMap(() => []));
                }
                case "login2fa": {
                    const secret = payload.password || accountConfig.credentials.twoFactorCode;

                    if (secret) {
                        rateLimitingCheck(secret);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: true}})),
                            unreadReset,
                            this.electronService
                                .webViewCaller(webView, accountType)("login2fa")({secret})
                                .pipe(
                                    mergeMap(() => []),
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
                    if (accountConfig.type !== "protonmail") {
                        throw new Error(
                            `Accounts with type "${accountConfig.type}" can't have action associated with the "${pageType}" page`,
                        );
                    }

                    const mailPassword = payload.password || accountConfig.credentials.mailPassword;

                    if (mailPassword) {
                        rateLimitingCheck(mailPassword);

                        return merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: true}})),
                            unreadReset,
                            this.electronService
                                .webViewCaller(webView, accountType)("unlock")({mailPassword})
                                .pipe(
                                    mergeMap(() => []),
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

            return merge([]);
        }));

    @Effect()
    accountPageLoadingStart$ = (() => {
        const notifications: Array<Observable<ReturnType<typeof ACCOUNTS_ACTIONS.NotificationPatch>>> = [];

        return this.actions$.pipe(
            filter(ACCOUNTS_ACTIONS.is.SetupNotifications),
            switchMap(({payload}) => {
                const {account, webView, unSubscribeOn} = payload;
                const {entryUrl} = account.accountConfig;
                const observable = this.electronService
                    .webViewCaller(webView, account.accountConfig.type)("notification", {unSubscribeOn, timeoutMs: 0})({entryUrl})
                    .pipe(
                        map((notification) => ACCOUNTS_ACTIONS.NotificationPatch({
                            accountConfig: account.accountConfig, notification,
                        })),
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

    @Effect()
    updateOverlayIcon$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.UpdateOverlayIcon),
        switchMap(({payload}) => this.electronService
            .callIpcMain("updateOverlayIcon")({unread: payload.count})
            .pipe(
                mergeMap(() => []),
                catchError((error) => of(CORE_ACTIONS.Fail(error))),
            )),
    );

    constructor(private electronService: ElectronService,
                private actions$: Actions,
                private store: Store<State>) {}
}
