import produce from "immer";
import {UnionOf} from "@vladimiry/unionize";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {ACCOUNTS_ACTIONS} from "src/web/src/app/store/actions";
import {LoginFieldContainer} from "src/shared/model/container";
import {WebAccount} from "src/web/src/app/model";
import {accountPickingPredicate} from "src/shared/util";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[reducers/accounts]");

export const featureName = "accounts";

export interface State extends fromRoot.State {
    selectedLogin?: string;
    initialized?: boolean;
    // TODO consider using "@ngrx/entity" library instead of dealing with a raw array
    accounts: WebAccount[];
}

const initialState: State = {
    accounts: [],
};

export function reducer(state = initialState, action: UnionOf<typeof ACCOUNTS_ACTIONS>): State {
    return produce(state, (draftState) => ACCOUNTS_ACTIONS.match(action, {
        WireUpConfigs: ({accountConfigs}) => {
            const needToPickNewLogin = typeof draftState.selectedLogin === "undefined"
                || !accountConfigs.map(({login}) => login).includes(draftState.selectedLogin);

            draftState.selectedLogin = needToPickNewLogin ? (accountConfigs.length ? accountConfigs[0].login : undefined)
                : draftState.selectedLogin;
            draftState.accounts = accountConfigs.reduce((accounts: WebAccount[], accountConfig) => {
                const {account} = pickAccountBundle(draftState.accounts, accountConfig, false);

                if (account) {
                    account.accountConfig = accountConfig;
                    if (!account.accountConfig.database) {
                        delete account.databaseView;
                    }
                    accounts.push(account);
                } else {
                    accounts.push({
                        accountConfig,
                        progress: {},
                        notifications: {
                            loggedIn: false,
                            unread: 0,
                            pageType: {url: "", type: "unknown"},
                        },
                    } as WebAccount); // TODO ger rid of "TS as" casting
                }

                return accounts;
            }, []);
            draftState.initialized = true;
        },
        Activate: ({login}) => {
            draftState.selectedLogin = login;
        },
        PatchProgress: (payload) => {
            const {account} = pickAccountBundle(draftState.accounts, payload);
            account.progress = {...account.progress, ...payload.patch};
        },
        Patch: ({login, patch}) => {
            logger.verbose("(Patch)", JSON.stringify({patch}));

            const {account} = pickAccountBundle(draftState.accounts, {login});

            if (patch.notifications) {
                account.notifications = {...account.notifications, ...patch.notifications};
            }
            if (patch.syncingActivated) {
                account.syncingActivated = patch.syncingActivated;
            }
            if (patch.loginFilledOnce) {
                account.loginFilledOnce = patch.loginFilledOnce;
            }
        },
        ToggleDatabaseView: ({login, forced}) => {
            const {account} = pickAccountBundle(draftState.accounts, {login});

            account.databaseView = forced
                ? forced.databaseView
                : !account.databaseView;
        },
        default: () => draftState,
    }));
}

function pickAccountBundle(accounts: WebAccount[], criteria: LoginFieldContainer, strict = true) {
    const index = accounts
        .map(({accountConfig}) => accountConfig)
        .findIndex(accountPickingPredicate(criteria));

    if (strict && index === -1) {
        throw new Error(`Account to process has not been found (login - "${criteria.login}")`);
    }

    return {index, account: accounts[index]};
}
