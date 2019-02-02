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
    globalProgress: {
        indexing?: boolean;
    };
}

const notFoundAccountError = new Error(`Failed to resolve account`);

const initialState: State = {
    accounts: [],
    globalProgress: {},
};

export function reducer(state = initialState, action: UnionOf<typeof ACCOUNTS_ACTIONS>): State {
    return produce(state, (draftState) => ACCOUNTS_ACTIONS.match(action, {
        WireUpConfigs: ({accountConfigs}) => {
            const needToPickNewLogin = (
                typeof draftState.selectedLogin === "undefined"
                ||
                !accountConfigs.map(({login}) => login).includes(draftState.selectedLogin)
            );

            if (needToPickNewLogin) {
                draftState.selectedLogin = accountConfigs.length
                    ? accountConfigs[0].login
                    : undefined;
            }

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
        Patch: ({login, patch, ignoreNoAccount}) => {
            logger.verbose("(Patch)", JSON.stringify({patch}));

            let account: WebAccount | undefined;

            try {
                const bundle = pickAccountBundle(draftState.accounts, {login});
                account = bundle.account;
            } catch (error) {
                if (error === notFoundAccountError && ignoreNoAccount) {
                    return;
                }
                throw error;
            }

            if ("notifications" in patch) {
                account.notifications = {...account.notifications, ...patch.notifications};
            }
            if ("syncingActivated" in patch) {
                account.syncingActivated = patch.syncingActivated;
            }
            if ("loginFilledOnce" in patch) {
                account.loginFilledOnce = patch.loginFilledOnce;
            }
        },
        ToggleDatabaseView: ({login, forced}) => {
            const {account} = pickAccountBundle(draftState.accounts, {login});

            account.databaseView = forced
                ? forced.databaseView
                : !account.databaseView;
        },
        PatchGlobalProgress: ({patch}) => {
            draftState.globalProgress = {...draftState.globalProgress, ...patch};
        },
        default: () => draftState,
    }));
}

function pickAccountBundle(accounts: WebAccount[], criteria: LoginFieldContainer, strict = true) {
    const index = accounts
        .map(({accountConfig}) => accountConfig)
        .findIndex(accountPickingPredicate(criteria));

    if (strict && index === -1) {
        throw notFoundAccountError;
    }

    return {index, account: accounts[index]};
}
