import {Actions, Effect} from "@ngrx/effects";
import {catchError, concatMap, defaultIfEmpty, filter, finalize, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";
import {EMPTY, from, merge, of, throwError, timer} from "rxjs";
import {Injectable} from "@angular/core";
import {Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/accounts";

const _logger = getZoneNameBoundWebLogger("[accounts.effects]");
const rateLimiter = __ELECTRON_EXPOSURE__.require["rolling-rate-limiter"]();

@Injectable()
export class AccountsEffects {
    twoPerTenSecLimiter = rateLimiter({
        interval: ONE_SECOND_MS * 10,
        maxInInterval: 2,
    });

    @Effect()
    toggleFetching$ = this.actions$.pipe(
        filter(ACCOUNTS_ACTIONS.is.ToggleFetching),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(({payload, logger}) => {
            const {account, webView, finishPromise} = payload;
            const {login, type} = account.accountConfig;
            const $stop = from(finishPromise).pipe(
                tap(() => logger.info("release")),
            );

            if (type !== "tutanota") {
                return throwError(new Error(`Messages fetching is not yet implemented for "${type}" email provider`));
            }

            logger.info("setup");

            // TODO release: increase interval time to 30 minutes
            // TODO make interval time configurable

            return this.api.webViewClient(webView, type, {finishPromise}).pipe(
                mergeMap((client) => timer(0, ONE_SECOND_MS * 30).pipe(
                    tap(() => logger.verbose("interval")),
                    // tslint:disable-next-line:ban
                    switchMap(() => this.api.ipcMainClient()("databaseMailRawNewestTimestamp")({type, login})),
                    tap(({value}) => logger.verbose(`${value ? "not " : ""}empty "rawNewestTimestamp" received from database`)),
                    mergeMap(({value: rawNewestTimestamp}) => {
                        // TODO handle network errors during fetching, test for online status
                        return client("fetchMessages")({type, login, rawNewestTimestamp, zoneName: logger.zoneName()}).pipe(
                            tap(({mail}) => logger.verbose("mail fetched", JSON.stringify({id: mail.id}))),
                            mergeMap(({mail}) => this.api.ipcMainClient()("databaseUpsert")({table: "Mail", data: [mail]}).pipe(
                                defaultIfEmpty(undefined),
                            )),
                            tap(() => logger.verbose("mail persisted")),
                            mergeMap(() => EMPTY),
                            catchError((error) => of(CORE_ACTIONS.Fail(error))),
                            takeUntil($stop),
                        );
                    }),
                    takeUntil($stop),
                )),
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
                            this.api.webViewClient(webView, type).pipe(
                                mergeMap((caller) => caller("login")({login, password, zoneName: logger.zoneName()})),
                                mergeMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: false}}))),
                            ),
                        );
                    }

                    logger.info("fillLogin");
                    return this.api.webViewClient(webView, type).pipe(
                        mergeMap((caller) => caller("fillLogin")({login, zoneName: logger.zoneName()})),
                        catchError((error) => of(CORE_ACTIONS.Fail(error))),
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
                            this.api.webViewClient(webView, type).pipe(
                                mergeMap((caller) => caller("login2fa")({secret, zoneName: logger.zoneName()})),
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
                            unreadReset,
                            this.api.webViewClient(webView, type).pipe(
                                mergeMap((caller) => caller("unlock")({mailPassword, zoneName: logger.zoneName()})),
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
        private actions$: Actions,
        private store: Store<State>,
    ) {}
}
