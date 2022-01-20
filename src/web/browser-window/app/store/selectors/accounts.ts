import {createFeatureSelector, createSelector} from "@ngrx/store";

import {accountPickingPredicate} from "src/shared/util";
import {featureName, State} from "src/web/browser-window/app/store/reducers/accounts";
import {LoginFieldContainer} from "src/shared/model/container";

export const STATE = createFeatureSelector<State>(featureName);

const accountsSelector = createSelector(STATE, (state) => state.accounts);

export const FEATURED = {
    accounts: accountsSelector,
    initialized: createSelector(STATE, (s) => s.initialized),
    selectedLogin: createSelector(STATE, (s) => s.selectedLogin),
    globalProgress: createSelector(STATE, (s) => s.globalProgress),
    selectedAccount: createSelector(
        STATE,
        (s) => s.accounts.find((a) => a.accountConfig.login === s.selectedLogin),
    ),
} as const;

export const ACCOUNTS = {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    pickAccount: (criteria: LoginFieldContainer) => {
        return createSelector(
            accountsSelector,
            (accounts) => {
                const configs = accounts.map((a) => a.accountConfig);
                const index = configs.findIndex(accountPickingPredicate(criteria));
                return index === -1 ? null : accounts[index];
            },
        );
    },
    loggedInAndUnreadSummary: createSelector(accountsSelector, (accounts) => {
        return accounts.reduce(
            (accumulator, {notifications}) => {
                accumulator.unread += notifications.unread;
                if (!notifications.loggedIn) {
                    accumulator.hasLoggedOut = true;
                }
                return accumulator;
            },
            {
                hasLoggedOut: false,
                unread: 0,
            },
        );
    }),
} as const;
