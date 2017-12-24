import {createFeatureSelector, createSelector} from "@ngrx/store";

import {WebAccount, WebAccountProgress} from "_shared/model/account";
import * as fromRoot from "_web_app/store/reducers/root";
import {AccountsActions} from "_web_app/store/actions";

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
            const resultState = {...state, initialized: true};
            const actualAccountConfigs = (action as AccountsActions.SyncAccountsConfigs).accountConfigs;

            // remove
            resultState.accounts = state.accounts.filter(({accountConfig}) =>
                actualAccountConfigs.some((actualAccountConfig) => {
                    const keep = actualAccountConfig.login === accountConfig.login;

                    // reset selected
                    if (!keep && resultState.selectedLogin === accountConfig.login) {
                        delete resultState.selectedLogin;
                    }

                    return keep;
                }),
            );

            for (const actualAccountConfig of actualAccountConfigs) {
                const {index} = selectAccountByLogin(resultState.accounts, actualAccountConfig.login, false);

                if (index !== -1) {
                    const accountToPatch = resultState.accounts[index];

                    if (JSON.stringify(accountToPatch.accountConfig) !== JSON.stringify(actualAccountConfig)) {
                        // update / patch
                        resultState.accounts[index] = {
                            ...accountToPatch,
                            accountConfig: actualAccountConfig,
                        };
                    }
                } else {
                    // add
                    resultState.accounts.push({
                        accountConfig: actualAccountConfig,
                        sync: {},
                        progress: {},
                    });
                }
            }

            // set selected
            if (!resultState.accounts.length) {
                delete resultState.selectedLogin;
            } else if (!resultState.selectedLogin) {
                resultState.selectedLogin = resultState.accounts[0].accountConfig.login;
            }

            return resultState;
        }
        // TODO remove not used "AccountsActions.AccountPatch" class
        case AccountsActions.AccountPatch.type: {
            // TODO create "patchAccountByLogin" method (silent=false)
            const actualAction = action as AccountsActions.AccountPatch;
            const {index, account} = selectAccountByLogin(state.accounts, actualAction.login);

            state.accounts[index] = {
                ...account,
                ...actualAction.patch,
            };

            return state;
        }
        case AccountsActions.AccountNotification.type: {
            // TODO create "patchAccountByLogin" method (silent=false)
            const actualAction = action as AccountsActions.AccountNotification;
            const {index, account} = selectAccountByLogin(state.accounts, actualAction.account.accountConfig.login);
            const accounts = [...state.accounts];

            switch (actualAction.payload.type) {
                case "title": {
                    accounts[index] = {
                        ...account,
                        sync: {...account.sync, ...{title: actualAction.payload.value}},
                    };
                    break;
                }
                case "unread": {
                    accounts[index] = {
                        ...account,
                        sync: {...account.sync, ...{unread: actualAction.payload.value}},
                    };
                    break;
                }
            }

            // console.log(JSON.stringify(state));

            return {
                ...state,
                accounts,
            };
        }
        case AccountsActions.ActivateAccount.type: {
            return {
                ...state,
                selectedLogin: (action as AccountsActions.ActivateAccount).login,
            };
        }
        case AccountsActions.PatchAccountProgress.type: {
            return patchAccountProgress(state, action as AccountsActions.PatchAccountProgress);
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

function patchAccountProgress(state: State, {login, patch}: { login: string, patch: WebAccountProgress }) {
    const {index, account} = selectAccountByLogin(state.accounts, login);
    // const account = state.accounts[index];

    if (!account) {
        return state;
    }

    const accounts = [...state.accounts];

    accounts[index] = {
        ...account,
        progress: {
            ...account.progress,
            ...patch,
        },
    };

    return {
        ...state,
        accounts,
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

// export const accountProgressByLoginSelector = (login: string) => createSelector(
//     accountsSelector,
//     (accounts) => {
//         const result = accounts
//             .filter(({accountConfig}) => accountConfig.login === login)
//             .shift();
//
//         console.log(login, result);
//
//         return result;
//     },
// );
