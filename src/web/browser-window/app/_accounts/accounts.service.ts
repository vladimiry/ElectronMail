import {Actions} from "@ngrx/effects";
import {EMPTY, Observable, merge, of, race, timer} from "rxjs";
import {Injectable} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {delay, distinctUntilChanged, filter, map, mergeMap, pairwise, take, takeUntil, tap} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {LoginFieldContainer} from "src/shared/model/container";
import {ONE_SECOND_MS} from "src/shared/constants";
import {ReadonlyDeep} from "type-fest";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";
import {getRandomInt} from "src/shared/util";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

@Injectable()
export class AccountsService {
    constructor(
        private readonly store: Store<State>,
        private readonly actions$: Actions<{ type: string; payload: any }>,
    ) {}

    buildLoginDelaysResetAction({login}: LoginFieldContainer) {
        return ACCOUNTS_ACTIONS.Patch({
            login,
            patch: {loginDelayedSeconds: undefined, loginDelayedUntilSelected: undefined},
        });
    }

    setupLoginDelayTrigger(
        account: ReadonlyDeep<WebAccount>,
        logger: ReturnType<typeof getZoneNameBoundWebLogger>,
    ): Observable<{ trigger: string }> {
        const {loginDelaySecondsRange, loginDelayUntilSelected = false, login} = account.accountConfig;
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
            const bootstrap$ = account.loggedInOnce
                ? of(true).pipe(
                    tap(() => {
                        // reset the account selection if has already been logged-in before (got logged-out from account)
                        this.store.dispatch(ACCOUNTS_ACTIONS.DeActivate({login}));
                    }),
                    delay(ONE_SECOND_MS),
                )
                : of(true);

            delayTriggers.push(
                bootstrap$.pipe(
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
                            // tslint:disable:max-line-length
                            // delay handles the case if the app has no selected account and "on select" trigger gets disabled
                            // if there is no selected account the app will select the account automatically
                            // and previously setup "on select" trigger kicks in before it gets reset by new TryToLogin action
                            // tslint:enable:max-line-length
                            delay(ONE_SECOND_MS * 1.5),
                            map(() => ({trigger: "triggered on account selection"})),
                        ),
                    )),
                ),
            );
        }

        const delayTriggersDispose$ = race([
            this.actions$.pipe(
                unionizeActionFilter(ACCOUNTS_ACTIONS.is.TryToLogin),
                filter(({payload}) => {
                    return payload.account.accountConfig.login === login;
                }),
                map(({type: actionType}) => `another "${actionType}" action triggered`),
            ),
            this.store.pipe(
                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                mergeMap((liveAccount) => liveAccount ? [liveAccount] : []),
                map(({notifications: {pageType}}) => pageType.type),
                distinctUntilChanged(),
                pairwise(),
                filter(([/* prev */, curr]) => curr !== "unknown"),
                map((value) => `page type changed to ${JSON.stringify(value)}`),
            ),
            this.store.pipe(
                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                map((liveAccount) => {
                    if (!liveAccount) {
                        return `Account has been removed`;
                    }
                    if (liveAccount.progress.password) {
                        return `"login" action performing is already in progress`;
                    }
                    return;
                }),
                filter((reason) => typeof reason === "string"),
            ),
        ]).pipe(
            take(1),
            tap((reason) => {
                logger.info(`disposing delayed "login" action with the following reason: ${reason}`);
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
                        this.store.dispatch(ACCOUNTS_ACTIONS.Activate({login}));
                    }
                    return {trigger};
                }),
            )),
            tap(({trigger}) => {
                this.store.dispatch(this.buildLoginDelaysResetAction({login}));
                logger.info(`login trigger: ${trigger})`);
            }),
        );
    }
}
