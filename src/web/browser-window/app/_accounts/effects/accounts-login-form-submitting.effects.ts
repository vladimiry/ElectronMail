import {Actions, createEffect} from "@ngrx/effects";
import {concatMap, delay, finalize, mergeMap, take} from "rxjs/operators";
import {EMPTY, from, merge, Observable, of} from "rxjs";
import {Injectable} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {consumeMemoryRateLimiter, curryFunctionMembers} from "src/shared/util";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {getWebLogger} from "src/web/browser-window/util";
import {ofType} from "src/shared/util/ngrx-of-type";
import {ONE_SECOND_MS} from "src/shared/const";
import {State} from "src/web/browser-window/app/store/reducers/accounts";

// TODO get rid of require "rate-limiter-flexible/lib/RateLimiterMemory" import
//      ES import makes the build fail in "web" context since webpack attempts to bundle the whole library which requires "node" context
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const RateLimiterMemory: typeof import("rate-limiter-flexible")["RateLimiterMemory"]
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    = require("rate-limiter-flexible/lib/RateLimiterMemory");

const _logger = getWebLogger(__filename);

@Injectable()
export class AccountsLoginFormSubmittingEffects {
    private readonly loginRateLimiterOptions = {
        points: 2,
        duration: 10, // seconds value
    } as const;

    private readonly loginRateLimiter = new RateLimiterMemory(this.loginRateLimiterOptions);

    readonly effect$ = createEffect(
        () => this.actions$.pipe(
            ofType(ACCOUNTS_ACTIONS.TryToLogin),
            mergeMap(({payload, ...action}) => {
                const {account, webView} = payload;
                const {accountConfig: {login, credentials, entryUrl}, notifications, accountIndex} = account;
                const logger = curryFunctionMembers(_logger, `[${action.type}][${accountIndex}]`);
                const {type: pageType, skipLoginDelayLogic} = notifications.pageType;
                const resetNotificationsState$ = of(this.accountsService.generatePrimaryNotificationsStateResetAction({login}));

                // TODO improve login submitting looping prevention
                const rateLimitCheck = async (password: string): Promise<void> => {
                    const key = String([login, pageType, password]);
                    const {waitTimeMs} = await consumeMemoryRateLimiter(
                        async () => this.loginRateLimiter.consume(key),
                    );
                    // tslint:disable-next-line:early-exit
                    if (waitTimeMs > 0) {
                        const {points, duration} = this.loginRateLimiterOptions;
                        throw new Error([
                            `It's not allowed to submit the same password for the same account`,
                            `more than ${points} times per ${duration} milliseconds (${JSON.stringify({pageType, waitTimeMs})}).`,
                            `Make sure that your login/password is correct.`,
                            `Auto login feature is disable until app restarted.`,
                        ].join(" "));
                    }
                };

                logger.verbose(JSON.stringify({pageType, skipLoginDelayLogic}));

                switch (pageType) {
                    case "login": {
                        const onlyFillLoginAction = (): Observable<import("@ngrx/store").Action> => {
                            logger.info("fillLogin");

                            return merge(
                                of(this.accountsService.buildLoginDelaysResetAction({login})),
                                this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7008}).pipe(
                                    mergeMap((webViewClient) => {
                                        return from(
                                            webViewClient("fillLogin")({login, accountIndex}),
                                        );
                                    }),
                                    mergeMap(() => of(ACCOUNTS_ACTIONS.Patch({login, patch: {loginFilledOnce: true}}))),
                                ),
                            );
                        };
                        const fullLoginAction = (): Observable<import("@ngrx/store").Action> => {
                            const executeLoginAction = (password: string): Observable<import("@ngrx/store").Action> => {
                                logger.info("login");

                                const action$ = merge(
                                    of(this.accountsService.buildLoginDelaysResetAction({login})),
                                    of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {password: true}})),
                                    resetNotificationsState$,
                                    this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7009}).pipe(
                                        delay(
                                            account.loggedInOnce
                                                ? ONE_SECOND_MS
                                                : 0,
                                        ),
                                        mergeMap((webViewClient) => {
                                            return from(
                                                webViewClient("login")({login, password, accountIndex}),
                                            );
                                        }),
                                        mergeMap(() => EMPTY),
                                        finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                            login,
                                            patch: {password: false}
                                        }))),
                                    ),
                                );

                                return from(
                                    rateLimitCheck(password),
                                ).pipe(
                                    concatMap(() => action$),
                                );
                            };
                            const trigger$: Observable<{ trigger: string }> = skipLoginDelayLogic
                                ? of({trigger: "the delay already took place, so immediate resolve"})
                                : this.accountsService.setupLoginDelayTrigger({login}, logger);

                            return trigger$.pipe(
                                mergeMap(() => this.store.pipe(
                                    select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                                    // WARN: do not react to every account change notification
                                    // but only reaction to just pick the up to date password (it can be changed during login delay)
                                    // otherwise multiple login form submitting attempts can happen
                                    take(1),
                                    mergeMap((value) => {
                                        if (!value) {
                                            // early skipping if account got removed during login delay
                                            logger.info("account got removed during login delaying?");
                                            return EMPTY;
                                        }
                                        return [{password: value.accountConfig.credentials.password}];
                                    }),
                                    mergeMap(({password}) => {
                                        if (!password) {
                                            logger.info("login action canceled due to the empty password");
                                            return EMPTY;
                                        }

                                        return executeLoginAction(password);
                                    }),
                                )),
                            );
                        };

                        return from(
                            // TODO handle the edge case of user to be very fast with manual login form submitting
                            //      in such case there is a possibility that we "resetProtonBackendSession" after the form got submitted
                            //      and so the app might potentially reset the cookies set after the fast manual login
                            this.api.ipcMainClient()("resetProtonBackendSession")({login, apiEndpointOrigin: entryUrl}),
                        ).pipe(
                            mergeMap(() => {
                                if (!credentials.password) {
                                    return onlyFillLoginAction();
                                }
                                return fullLoginAction();
                            }),
                        );
                    }
                    case "login2fa": {
                        const {twoFactorCode: secret} = credentials;

                        if (!secret) {
                            break;
                        }

                        const action$ = merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {twoFactorCode: true}})),
                            resetNotificationsState$,
                            this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7010}).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("login2fa")({secret, accountIndex}),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                    login,
                                    patch: {twoFactorCode: false}
                                }))),
                            ),
                        );

                        logger.info("login2fa");

                        return from(
                            rateLimitCheck(secret),
                        ).pipe(
                            concatMap(() => action$),
                        );
                    }
                    case "unlock": {
                        const mailPassword = "mailPassword" in credentials && credentials.mailPassword;

                        if (!mailPassword) {
                            break;
                        }

                        const action$ = merge(
                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {mailPassword: true}})),
                            resetNotificationsState$,
                            // TODO TS: resolve "webViewClient" calling "this.api.webViewClient" as normally
                            of(__ELECTRON_EXPOSURE__.buildIpcPrimaryWebViewClient(webView)).pipe(
                                mergeMap((webViewClient) => {
                                    return from(
                                        webViewClient("unlock")({mailPassword, accountIndex}),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                                finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({
                                    login,
                                    patch: {mailPassword: false}
                                }))),
                            ),
                        );

                        logger.info("unlock");

                        return from(
                            rateLimitCheck(mailPassword),
                        ).pipe(
                            concatMap(() => action$),
                        );
                    }
                }

                logger.verbose("empty");

                return [];
            }),
        ),
    );

    constructor(
        private readonly actions$: Actions,
        private readonly api: ElectronService,
        private readonly store: Store<State>,
        private readonly accountsService: AccountsService,
    ) {}
}
