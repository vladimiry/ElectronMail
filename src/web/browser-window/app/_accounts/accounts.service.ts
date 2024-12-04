import {delay, distinctUntilChanged, filter, map, mergeMap, pairwise, switchMap, take, takeUntil, tap} from "rxjs/operators";
import {EMPTY, merge, Observable, of, race, timer} from "rxjs";
import {Injectable} from "@angular/core";
import {isDeepEqual, pick} from "remeda";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {getRandomInt} from "src/shared/util";
import {getWebLogger} from "src/web/browser-window/util";
import {LoginFieldContainer} from "src/shared/model/container";
import {ONE_SECOND_MS} from "src/shared/const";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";

@Injectable()
export class AccountsService {
    constructor(
        private readonly store: Store<State>,
    ) {
    }

    generatePrimaryNotificationsStateResetAction(
        {login, optionalAccount}: { login: string; optionalAccount?: boolean }
    ): ReturnType<typeof ACCOUNTS_ACTIONS.Patch> {
        return ACCOUNTS_ACTIONS.Patch({
            login,
            patch: {notifications: {unread: 0, loggedIn: false}},
            optionalAccount,
        });
    }

    buildLoginDelaysResetAction(
        {login}: LoginFieldContainer,
    ): ReturnType<typeof ACCOUNTS_ACTIONS.Patch> {
        return ACCOUNTS_ACTIONS.Patch({
            login,
            patch: {loginDelayedSeconds: undefined, loginDelayedUntilSelected: undefined},
        });
    }

    setupLoginDelayTrigger(
        {login, takeUntil$}: NoExtraProps<Pick<WebAccount["accountConfig"], "login">> & { takeUntil$: Observable<Electron.WebviewTag> },
        logger: ReturnType<typeof getWebLogger>,
    ): Observable<{ trigger: string }> {
        const account$ = this.store.pipe(
            select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
        );
        const props = ["loginDelayUntilSelected", "loginDelaySecondsRange"] as const;

        return account$.pipe(
            mergeMap((account) => account ? [account] as const : [] as const),
            distinctUntilChanged(({accountConfig: prev}, {accountConfig: curr}) => {
                // check if related props changed
                return isDeepEqual(pick(prev, props), pick(curr, props));
            }),
            // WARN: "switchMap" used to drop previously setup notification (we don't need them to run in parallel)
            // so we re-setup the "delay" logic if related props changed (see above "distinctUntilChanged" check)
            switchMap(({accountConfig}) => {
                const {loginDelaySecondsRange, loginDelayUntilSelected} = pick(accountConfig, [...props]);
                const delayTriggers: Array<Observable<{ trigger: string }>> = [];

                logger.info(`login delay configs: ${JSON.stringify({loginDelayUntilSelected, loginDelaySecondsRange})}`);

                this.store.dispatch(this.buildLoginDelaysResetAction({login}));

                if (loginDelaySecondsRange) {
                    const {start, end} = loginDelaySecondsRange;
                    const delayTimeMs = getRandomInt(start, end) * ONE_SECOND_MS;

                    logger.info(`resolved login delay (ms): ${delayTimeMs}`);

                    delayTriggers.push(
                        merge(
                            timer(delayTimeMs).pipe(
                                map(() => ({trigger: `triggered on login delay expiration (ms): ${delayTimeMs}`})),
                            ),
                            timer(0, ONE_SECOND_MS).pipe(
                                mergeMap((value) => {
                                    const loginDelayedSeconds = (delayTimeMs / ONE_SECOND_MS) - value;
                                    this.store.dispatch(
                                        ACCOUNTS_ACTIONS.Patch({login, patch: {loginDelayedSeconds}}),
                                    );
                                    return EMPTY;
                                }),
                            ),
                        ),
                    );
                }

                if (loginDelayUntilSelected) {
                    const fireDeselectAndDelayForOneSec$ = (
                        () => {
                            this.store.dispatch(ACCOUNTS_ACTIONS.DeSelect({login}));
                            return timer(ONE_SECOND_MS);
                        }
                    )();

                    delayTriggers.push(
                        fireDeselectAndDelayForOneSec$.pipe(
                            mergeMap(() => merge(
                                (() => {
                                    this.store.dispatch(
                                        ACCOUNTS_ACTIONS.Patch({login, patch: {loginDelayedUntilSelected: true}}),
                                    );
                                    return EMPTY;
                                })(),
                                this.store.pipe(
                                    select(AccountsSelectors.FEATURED.selectedLogin),
                                    filter((selectedLogin) => selectedLogin === login),
                                    // delay handles the case if the app has no selected account and "on select" trigger gets disabled
                                    // if there is no selected account the app will select the account automatically
                                    // and previously setup "on select" trigger kicks in before it gets reset by new TryToLogin action
                                    delay(ONE_SECOND_MS * 1.5),
                                    map(() => ({trigger: "triggered on account selection"})),
                                ),
                            )),
                        ),
                    );
                }

                const delayTriggersDispose$ = race(
                    account$.pipe(
                        mergeMap((account) => account ? [account] : []),
                        map(({notifications: {pageType}}) => pageType.type),
                        distinctUntilChanged(),
                        pairwise(),
                        filter(([/* prev */, curr]) => curr !== "unknown"),
                        map((value) => `page type changed to ${JSON.stringify(value)}`),
                    ),
                    account$.pipe(
                        map((account) => {
                            if (!account) {
                                return `Account has been removed`;
                            }
                            if (account.progress.password) {
                                return `"login" action performing is already in progress`;
                            }
                            return void 0;
                        }),
                        filter((reason) => typeof reason === "string"),
                    ),
                ).pipe(
                    take(1),
                    tap((reason) => {
                        logger.info(`disposing delayed "login" action with the following reason: ${String(reason)}`);
                    }),
                );
                const trigger$ = delayTriggers.length
                    ? race(delayTriggers).pipe(
                        take(1), // WARN: just one notification
                        takeUntil(delayTriggersDispose$),
                    )
                    : of({trigger: "triggered immediate login (as no delays defined)"});

                return trigger$.pipe(
                    mergeMap(({trigger}) => this.store.pipe(
                        select(AccountsSelectors.FEATURED.selectedLogin),
                        take(1),
                        map((selectedLogin) => {
                            if (!selectedLogin) {
                                // let's select the account if none has been selected
                                this.store.dispatch(ACCOUNTS_ACTIONS.Select({login}));
                            }
                            return {trigger};
                        }),
                    )),
                    tap(({trigger}) => {
                        this.store.dispatch(this.buildLoginDelaysResetAction({login}));
                        logger.info(`login trigger: ${trigger})`);
                    }),
                );
            }),
            takeUntil(takeUntil$),
        );
    }
}
