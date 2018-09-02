import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, from, merge, of, Subject, timer} from "rxjs";
import {Injectable} from "@angular/core";
import {Store} from "@ngrx/store";
import {catchError, concatMap, filter, finalize, map, mergeMap, takeUntil, tap} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, OPTIONS_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {AccountTypeAndLoginFieldContainer} from "src/shared/model/container";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/accounts";
import {TutanotaNotificationOutput} from "src/shared/api/webview/tutanota";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const rateLimiter = __ELECTRON_EXPOSURE__.require["rolling-rate-limiter"]();
const _logger = getZoneNameBoundWebLogger("[accounts.effects]");

@Injectable()
export class AccountsEffects {
    twoPerTenSecLimiter = rateLimiter({
        interval: ONE_SECOND_MS * 10,
        maxInInterval: 2,
    });

    fireFetchingIteration$ = new Subject<AccountTypeAndLoginFieldContainer>();

    @Effect()
    syncAccountsConfigs$ = this.actions$.pipe(
        unionizeActionFilter(OPTIONS_ACTIONS.is.GetSettingsResponse),
        map(({payload}) => ACCOUNTS_ACTIONS.WireUpConfigs({accountConfigs: payload.accounts})),
    );

    @Effect()
    setupNotificationChannel$ = (() => {
        const merged$ = EMPTY;

        return this.actions$.pipe(
            unionizeActionFilter(ACCOUNTS_ACTIONS.is.SetupNotificationChannel),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload, logger}) => {
                const {account, webView, finishPromise} = payload;
                const {type, login, entryUrl} = account.accountConfig;
                const $dispose = from(finishPromise).pipe(tap(() => logger.info("dispose")));

                logger.info("setup");

                return merge(
                    merged$,
                    this.api.webViewClient(webView, type, {finishPromise}).pipe(
                        mergeMap((webViewClient) => webViewClient("notification")({entryUrl, zoneName: logger.zoneName()})),
                        mergeMap((notification) => {
                            if (type === "tutanota" && (notification as TutanotaNotificationOutput).batchEntityUpdatesCounter) {
                                this.fireFetchingIteration$.next({type, login});
                            }

                            return of(ACCOUNTS_ACTIONS.NotificationPatch({login, notification}));
                        }),
                        takeUntil($dispose),
                    ),
                );
            }),
        );
    })();

    @Effect()
    toggleFetching$ = (() => {
        const merged$ = EMPTY;

        return this.actions$.pipe(
            unionizeActionFilter(ACCOUNTS_ACTIONS.is.ToggleFetching),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload, logger}) => {
                const {account, webView, finishPromise} = payload;
                const {type, login} = account.accountConfig;
                const $dispose = from(finishPromise).pipe(tap(() => logger.info("dispose")));
                const ipcMainClient = this.api.ipcMainClient();
                const zoneName = logger.zoneName();

                if (type !== "tutanota") {
                    throw new Error(`Local store is supported for "${type}" only for now`);
                }

                // TODO consider making interval time configurable
                // TODO handle network errors during fetching, test for online status

                logger.info("setup");

                return merge(
                    merged$,
                    this.api.webViewClient(webView, type, {finishPromise}).pipe(
                        mergeMap((webViewClient) => ipcMainClient("dbGetContentMetadata")({type, login}).pipe(
                            mergeMap(() => merge(
                                timer(0, ONE_SECOND_MS * 60 * 5).pipe(
                                    tap(() => logger.verbose(`trigger: timer`)),
                                    map(() => ({forceFlush: true})),
                                ),
                                this.fireFetchingIteration$.pipe(
                                    filter((value) => value.type === type && value.login === login),
                                    tap(() => logger.verbose(`trigger: fireFetchingIteration$`)),
                                    map(() => ({forceFlush: false})),
                                ),
                            ).pipe(
                                filter(() => navigator.onLine),
                            )),
                            concatMap(({forceFlush}) => ipcMainClient("dbGetContentMetadata")({type, login}).pipe(
                                concatMap((metadata) => {
                                    if (metadata.type !== "tutanota") {
                                        throw new Error(`Local store is supported for "${metadata.type}" only for now`);
                                    }
                                    return webViewClient("buildBatchEntityUpdatesDbPatch")({...metadata, zoneName});
                                }),
                                concatMap((patch) => ipcMainClient("dbPatch")({type, login, forceFlush, ...patch})),
                                concatMap(() => EMPTY),
                                catchError((error) => of(CORE_ACTIONS.Fail(error))),
                            )),
                            catchError((error) => of(CORE_ACTIONS.Fail(error))),
                        )),
                        takeUntil($dispose),
                    ),
                );
            }),
        );
    })();

    @Effect()
    tryToLogin$ = this.actions$.pipe(
        unionizeActionFilter(ACCOUNTS_ACTIONS.is.TryToLogin),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload, logger}) => {
            const {account, webView} = payload;
            const {accountConfig, notifications} = account;
            const {type, login, credentials} = accountConfig;
            const pageType = notifications.pageType.type;
            const unreadReset = of(ACCOUNTS_ACTIONS.NotificationPatch({login, notification: {unread: 0}}));
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
                            unreadReset,
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
                        mergeMap(() => EMPTY),
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
                            unreadReset,
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
                            unreadReset,
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
        private actions$: Actions<{ type: string; payload: any }>,
        private store: Store<State>,
    ) {}
}
