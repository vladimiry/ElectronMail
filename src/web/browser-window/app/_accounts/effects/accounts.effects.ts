import {Actions, createEffect} from "@ngrx/effects";
import {concatMap, first, map, mergeMap, withLatestFrom} from "rxjs/operators";
import {inject, Injectable} from "@angular/core";
import {merge, of, race, throwError, timer} from "rxjs";
import {produce} from "immer";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountViewComponent} from "src/web/browser-window/app/_accounts/account.component";
import {ofType} from "src/shared/util/ngrx-of-type";
import {ONE_SECOND_MS} from "src/shared/const";
import {State} from "src/web/browser-window/app/store/reducers/accounts";

@Injectable()
export class AccountsEffects {
    private readonly actions$ = inject(Actions);
    private readonly store = inject<Store<State>>(Store);

    readonly wireUpConfigs$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(OPTIONS_ACTIONS.GetSettingsResponse),
                map(({payload}) => ACCOUNTS_ACTIONS.WireUpConfigs({accountConfigs: payload.accounts})),
            ),
    );

    readonly unload$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ACCOUNTS_ACTIONS.Unload),
                withLatestFrom(this.store.pipe(select(AccountsSelectors.FEATURED.accounts))),
                mergeMap(([{payload}, accounts]) => {
                    const accountConfigs = accounts.map(({accountConfig}) => accountConfig);
                    const componentDestroyingTimeoutMs = ONE_SECOND_MS / 2;
                    const unloadLogins = new Set([payload.login]);
                    return merge(
                        of(
                            ACCOUNTS_ACTIONS.DeSelect({login: payload.login}),
                        ),
                        of(
                            ACCOUNTS_ACTIONS.WireUpConfigs({
                                accountConfigs: produce(accountConfigs, (draftState) => {
                                    const item = draftState.find(({login}) => login === payload.login);
                                    if (!item) {
                                        throw new Error("Failed to resolve account by login");
                                    }
                                    // making the component disabled in order for it to get "unloaded" - UI component gets destroyed
                                    // original value gets back with below/consequent WireUpConfigs call - fresh UI component gets created
                                    item.disabled = true;
                                }),
                                notSelectableLogins: unloadLogins,
                            }),
                        ),
                        race(
                            AccountViewComponent.componentDestroyingNotification$.pipe(first()),
                            timer(componentDestroyingTimeoutMs).pipe(
                                concatMap(() =>
                                    throwError(() =>
                                        new Error(
                                            `Failed to detect account component destroying in ${componentDestroyingTimeoutMs}ms`,
                                        )
                                    )
                                ),
                            ),
                        ).pipe(
                            // restoring the original data
                            mergeMap(() =>
                                of(ACCOUNTS_ACTIONS.WireUpConfigs({
                                    accountConfigs,
                                    notSelectableLogins: unloadLogins,
                                    loginsToResetEnabledAccountsBy: unloadLogins,
                                }))
                            ),
                        ),
                    );
                }),
            ),
    );
}
