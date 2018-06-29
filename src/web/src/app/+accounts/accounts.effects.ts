import {Actions, Effect} from "@ngrx/effects";
import {catchError, filter, finalize, map, mergeMap, switchMap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {merge as observableMerge, Observable, of} from "rxjs";
import {Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, OPTIONS_ACTIONS} from "_@web/src/app/store/actions";
import {EffectsService} from "../+core/effects.service";
import {ElectronService} from "../+core/electron.service";
import {State} from "_@web/src/app/store/reducers/accounts";

@Injectable()
export class AccountsEffects {
    @Effect()
    syncAccountsConfigs$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.GetSettingsResponse),
        map(({payload}) => ACCOUNTS_ACTIONS.SyncAccountsConfigs({accountConfigs: payload.accounts})),
    );

    @Effect()
    accountLogin$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.Login),
        switchMap(({payload}) => {
            const {pageType, webView, account, password} = payload;
            const {login} = account.accountConfig;

            switch (pageType) {
                case "login": {
                    return observableMerge(
                        of(ACCOUNTS_ACTIONS.PatchAccountProgress({login, patch: {password: true}})),
                        this.electronService
                            .webViewCaller(webView)("login")({login, password})
                            .pipe(
                                mergeMap(() => []),
                                catchError((error) => this.effectsService.buildFailActionObservable(error)),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchAccountProgress({
                                    login, patch: {password: false},
                                }))),
                            ),
                    );
                }
                case "login2fa": {
                    return observableMerge(
                        of(ACCOUNTS_ACTIONS.PatchAccountProgress({login, patch: {password2fa: true}})),
                        this.electronService
                            .webViewCaller(webView)("login2fa")({password})
                            .pipe(
                                mergeMap(() => []),
                                catchError((error) => this.effectsService.buildFailActionObservable(error)),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchAccountProgress({
                                    login, patch: {password2fa: false},
                                }))),
                            ),
                    );
                }
                case "unlock": {
                    return observableMerge(
                        of(ACCOUNTS_ACTIONS.PatchAccountProgress({login, patch: {mailPassword: true}})),
                        this.electronService
                            .webViewCaller(webView)("unlock")({mailPassword: password})
                            .pipe(
                                mergeMap(() => []),
                                catchError((error) => this.effectsService.buildFailActionObservable(error)),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchAccountProgress({
                                    login, patch: {mailPassword: false},
                                }))),
                            ),
                    );
                }
            }

            throw new Error(`Unexpected page type: ${pageType}`);
        }));

    @Effect()
    accountPageLoadingStart$ = (() => {
        const notifications: Array<Observable<ReturnType<typeof ACCOUNTS_ACTIONS.AccountNotification>>> = [];

        return this.actions$.pipe(
            filter(ACCOUNTS_ACTIONS.is.PageLoadingStart),
            switchMap(({payload}) => {
                const {account, webView, unSubscribeOn} = payload;
                const observable = this.electronService
                    .webViewCaller(webView)("notification", {unSubscribeOn, timeoutMs: 0})()
                    .pipe(
                        map((notification) => ACCOUNTS_ACTIONS.AccountNotification({
                            accountConfig: account.accountConfig, notification,
                        })),
                    );

                if (unSubscribeOn) {
                    unSubscribeOn.then(() => {
                        notifications.splice(notifications.indexOf(observable), 1);
                    });
                }

                notifications.push(observable);

                return observableMerge(...notifications);
            }),
            catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
        );
    })();

    @Effect()
    accountPageLoadingEnd$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.PageLoadingEnd),
        switchMap(({payload}) => {
            const {account, webView} = payload;
            const {accountConfig} = account;
            const {credentials} = accountConfig;
            const pageType = account.sync.pageType.type;

            switch (pageType) {
                case "login": {
                    if (credentials.password.value) {
                        return of(ACCOUNTS_ACTIONS.Login({pageType, webView, account, password: credentials.password.value}));
                    } else {
                        return this.electronService
                            .webViewCaller(webView)("fillLogin")({login: accountConfig.login})
                            .pipe(mergeMap(() => []));
                    }
                }
                case "login2fa": {
                    if (credentials.twoFactorCode && credentials.twoFactorCode.value) {
                        return of(ACCOUNTS_ACTIONS.Login({pageType, webView, account, password: credentials.twoFactorCode.value}));
                    }
                    break;
                }
                case "unlock": {
                    if (credentials.mailPassword.value) {
                        return of(ACCOUNTS_ACTIONS.Login({pageType, webView, account, password: credentials.mailPassword.value}));
                    }
                    break;
                }
            }

            return observableMerge([]);
        }),
        catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
    );

    @Effect()
    updateOverlayIcon$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.UpdateOverlayIcon),
        switchMap(({payload}) => this.electronService
            .callIpcMain("updateOverlayIcon")({unread: payload.count, dataURL: payload.dataURL})
            .pipe(
                mergeMap(() => []),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )),
    );

    constructor(private effectsService: EffectsService,
                private electronService: ElectronService,
                private actions$: Actions,
                private store: Store<State>) {}
}
