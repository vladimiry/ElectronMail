import {Actions, Effect} from "@ngrx/effects";
import {catchError, finalize, map, mergeMap, switchMap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {merge as observableMerge, Observable, of} from "rxjs";
import {Store} from "@ngrx/store";

import {AccountsActions, OptionsActions} from "_web_src/app/store/actions";
import {EffectsService} from "../+core/effects.service";
import {ElectronService} from "./../+core/electron.service";
import {State} from "_web_src/app/store/reducers/accounts";

@Injectable()
export class AccountsEffects {
    @Effect()
    syncAccountsConfigs$ = this.actions$
        .ofType<OptionsActions.GetSettingsResponse>(OptionsActions.GetSettingsResponse.type)
        .pipe(map(({settings}) => new AccountsActions.SyncAccountsConfigs(settings.accounts)));

    @Effect()
    accountLogin$ = this.actions$
        .ofType<AccountsActions.Login>(AccountsActions.Login.type)
        .pipe(switchMap(({pageType, webView, account, password}) => {
            const login = account.accountConfig.login;

            switch (pageType) {
                case "login": {
                    return observableMerge(
                        of(new AccountsActions.PatchAccountProgress(login, {password: true})),
                        this.electronService
                            .webViewCaller(webView)("login")({login, password})
                            .pipe(
                                mergeMap(() => []),
                                catchError((error) => this.effectsService.buildFailActionObservable(error)),
                                finalize(() => this.store.dispatch(new AccountsActions.PatchAccountProgress(login, {password: false}))),
                            ),
                    );
                }
                case "login2fa": {
                    return observableMerge(
                        of(new AccountsActions.PatchAccountProgress(login, {password2fa: true})),
                        this.electronService
                            .webViewCaller(webView)("login2fa")({password})
                            .pipe(
                                mergeMap(() => []),
                                catchError((error) => this.effectsService.buildFailActionObservable(error)),
                                finalize(() => this.store.dispatch(new AccountsActions.PatchAccountProgress(login, {password2fa: false}))),
                            ),
                    );
                }
                case "unlock": {
                    return observableMerge(
                        of(new AccountsActions.PatchAccountProgress(login, {mailPassword: true})),
                        this.electronService
                            .webViewCaller(webView)("unlock")({mailPassword: password})
                            .pipe(
                                mergeMap(() => []),
                                catchError((error) => this.effectsService.buildFailActionObservable(error)),
                                finalize(() => this.store.dispatch(new AccountsActions.PatchAccountProgress(login, {mailPassword: false}))),
                            ),
                    );
                }
            }

            throw new Error(`Unexpected page type: ${pageType}`);
        }));

    @Effect()
    accountPageLoadingStart$ = (() => {
        const notifications: Array<Observable<AccountsActions.AccountNotification>> = [];

        return this.actions$
            .ofType<AccountsActions.PageLoadingStart>(AccountsActions.PageLoadingStart.type)
            .pipe(
                switchMap(({account, webView, unSubscribeOn}) => {
                    notifications.push(
                        this.electronService
                            .webViewCaller(webView)("notification", {unSubscribeOn, timeoutMs: 0})(undefined)
                            .pipe(map((notification) => new AccountsActions.AccountNotification(account.accountConfig, notification))),
                    );

                    return observableMerge(...notifications);
                }),
                catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
            );
    })();

    @Effect()
    accountPageLoadingEnd$ = this.actions$
        .ofType<AccountsActions.PageLoadingEnd>(AccountsActions.PageLoadingEnd.type)
        .pipe(
            switchMap(({account, webView}) => {
                const {accountConfig} = account;
                const pageType = account.sync.pageType.type;
                const credentials = accountConfig.credentials;

                switch (pageType) {
                    case "login": {
                        if (credentials.password.value) {
                            return of(
                                new AccountsActions.Login(pageType, webView, account, credentials.password.value),
                            );
                        } else {
                            return this.electronService
                                .webViewCaller(webView)("fillLogin")({login: accountConfig.login})
                                .pipe(mergeMap(() => []));
                        }
                    }
                    case "login2fa": {
                        if (credentials.twoFactorCode && credentials.twoFactorCode.value) {
                            return of(
                                new AccountsActions.Login(pageType, webView, account, credentials.twoFactorCode.value),
                            );
                        }
                        break;
                    }
                    case "unlock": {
                        if (credentials.mailPassword.value) {
                            return of(
                                new AccountsActions.Login(pageType, webView, account, credentials.mailPassword.value),
                            );
                        }
                        break;
                    }
                }

                return observableMerge([]);
            }),
            catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
        );

    @Effect()
    updateOverlayIcon$ = this.actions$
        .ofType<AccountsActions.UpdateOverlayIcon>(AccountsActions.UpdateOverlayIcon.type)
        .pipe(switchMap(({count, dataURL}) => this.electronService
            .callIpcMain("updateOverlayIcon")({count, dataURL})
            .pipe(
                mergeMap(() => []),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    constructor(private effectsService: EffectsService,
                private electronService: ElectronService,
                private actions$: Actions,
                private store: Store<State>) {}
}
