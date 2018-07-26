import {createFeatureSelector, createSelector} from "@ngrx/store";

import {featureName, State} from "src/web/src/app/store/reducers/accounts";

export const STATE = createFeatureSelector<State>(featureName);

const accountsSelector = createSelector(STATE, ({accounts}) => accounts);

export const FEATURED = {
    initialized: createSelector(STATE, ({initialized}) => initialized),
    accounts: accountsSelector,
    selectedLogin: createSelector(STATE, ({selectedLogin}) => selectedLogin),
    selectedAccount: createSelector(
        STATE,
        ({selectedLogin, accounts}) => accounts.find(({accountConfig}) => accountConfig.login === selectedLogin),
    ),
};

export const ACCOUNTS = {
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
};
