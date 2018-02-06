import {createFeatureSelector, createSelector} from "@ngrx/store";
import {updateIn} from "hydux-mutator";

import * as fromRoot from "_web_app/store/reducers/root";
import {AccountsActions} from "_web_app/store/actions";
import {WebAccount} from "_shared/model/account";

export const featureName = "accounts";

export interface State extends fromRoot.State {
    selectedLogin?: string;
    initialized?: boolean;
    accounts: WebAccount[];
}

const initialState: State = {
    accounts: [],
};

export function reducer(state = initialState, action: AccountsActions.All): State {
    switch (action.type) {
        // TODO consider using "@ngrx/entity" library instead of dealing with a raw array
        case AccountsActions.SyncAccountsConfigs.type: {
            const accountConfigs = (action as AccountsActions.SyncAccountsConfigs).accountConfigs;

            // remove
            const accounts = state.accounts.filter(({accountConfig}) =>
                accountConfigs.some(({login}) => accountConfig.login === login),
            );

            for (const accountConfig of accountConfigs) {
                const {index} = selectAccountByLogin(accounts, accountConfig.login, false);

                if (index === -1) {
                    // add
                    accounts.push({
                        accountConfig,
                        progress: {},
                        sync: {
                            pageType: {
                                url: "initial",
                            },
                        },
                    });
                } else {
                    const account = accounts[index];

                    if (JSON.stringify(account.accountConfig) !== JSON.stringify(accountConfig)) {
                        // update / patch
                        accounts[index] = {
                            ...account,
                            accountConfig,
                        };
                    }
                }
            }

            return {
                ...state,
                accounts,
                initialized: true,
                selectedLogin: accounts.some(({accountConfig}) => accountConfig.login === state.selectedLogin)
                    ? state.selectedLogin
                    : accounts.length ? accounts[0].accountConfig.login : undefined,
            };
        }
        case AccountsActions.AccountNotification.type: {
            const {accountConfig, notification} = action as AccountsActions.AccountNotification;
            const {index} = selectAccountByLogin(state.accounts, accountConfig.login);

            if ("value" in notification) {
                return updateIn(
                    state,
                    (_) => _.accounts[index],
                    (account) => ({
                        ...account,
                        sync: {...account.sync, ...{[notification.type]: notification.value}},
                    }),
                    [index],
                );
            }

            return state;
        }
        case AccountsActions.ActivateAccount.type: {
            return {
                ...state,
                selectedLogin: (action as AccountsActions.ActivateAccount).login,
            };
        }
        case AccountsActions.PatchAccountProgress.type: {
            const {login, patch} = action as AccountsActions.PatchAccountProgress;
            const {index} = selectAccountByLogin(state.accounts, login);

            return updateIn(
                state,
                (_) => _.accounts[index],
                (_) => ({
                    ..._,
                    ...patch,
                }),
                [index],
            );
        }
        default: {
            return state;
        }
    }
}

function selectAccountByLogin(accounts: WebAccount[], login: string, strict = true) {
    const index = accounts.findIndex(({accountConfig}) => accountConfig.login === login);

    if (strict && index === -1) {
        throw new Error(`Account to process has not been found (login - "${login}")`);
    }

    return {
        index,
        account: accounts[index],
    };
}

export const stateSelector = createFeatureSelector<State>(featureName);
export const initializedSelector = createSelector(stateSelector, ({initialized}) => initialized);
export const accountsSelector = createSelector(stateSelector, ({accounts}) => accounts);
export const selectedLoginSelector = createSelector(stateSelector, ({selectedLogin}) => selectedLogin);
export const selectedAccountSelector = createSelector(
    stateSelector,
    ({selectedLogin, accounts}) => accounts.find(({accountConfig}) => accountConfig.login === selectedLogin),
);
export const accountsUnreadSummarySelector = createSelector(accountsSelector, (accounts) => {
    return accounts.reduce((sum, {sync}) => sum + (sync.unread || 0), 0);
});
