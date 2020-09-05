import {UnionOf} from "@vladimiry/unionize";
import {produce} from "immer";

import * as fromRoot from "src/web/browser-window/app/store/reducers/root";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {LoginFieldContainer} from "src/shared/model/container";
import {WebAccount} from "src/web/browser-window/app/model";
import {accountPickingPredicate} from "src/shared/util";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

const logger = getZoneNameBoundWebLogger("[reducers/accounts]");

export const featureName = "accounts";

const notFoundAccountError = new Error(`Failed to resolve account`);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function pickAccountBundle(accounts: WebAccount[], criteria: LoginFieldContainer, strict = true) {
    const index = accounts
        .map(({accountConfig}) => accountConfig)
        .findIndex(accountPickingPredicate(criteria));

    if (strict && index === -1) {
        throw notFoundAccountError;
    }

    return {index, account: accounts[index]};
}

export interface State extends fromRoot.State {
    selectedLogin?: string;
    initialized?: boolean;
    // TODO consider using "@ngrx/entity" library instead of dealing with a raw array
    accounts: WebAccount[];
    globalProgress: {
        indexing?: boolean;
    };
}

const initialState: State = {
    accounts: [],
    globalProgress: {},
};

export function reducer(state = initialState, action: UnionOf<typeof ACCOUNTS_ACTIONS> & UnionOf<typeof NAVIGATION_ACTIONS>): State {
    if (NAVIGATION_ACTIONS.is.Logout(action)) {
        return initialState;
    }

    return produce(state, (draftState) => ACCOUNTS_ACTIONS.match(action, {
        WireUpConfigs({accountConfigs}) {
            const webAccounts = accountConfigs
                .filter((accountConfig) => !accountConfig.disabled)
                .reduce((accounts: WebAccount[], accountConfig) => {
                    const {account} = pickAccountBundle(draftState.accounts, accountConfig, false);

                    if (account) {
                        account.accountConfig = accountConfig;
                        if (!account.accountConfig.database) {
                            delete account.databaseView;
                        }
                        accounts.push(account);
                    } else {
                        const webAccount: WebAccount = {
                            accountConfig,
                            progress: {},
                            notifications: {
                                loggedIn: false,
                                pageType: {url: "", type: "unknown"},
                                unread: 0,
                            },
                            dbExportProgress: [],
                            fetchSingleMailParams: null,
                            makeReadMailParams: null,
                            setMailFolderParams: null,
                        };

                        accounts.push(webAccount);
                    }

                    return accounts;
                }, []);

            if (
                typeof draftState.selectedLogin === "undefined"
                ||
                !webAccounts
                    .map(({accountConfig: {login}}) => login)
                    .includes(draftState.selectedLogin)
            ) { // setting new "selected login" value
                const webAccountToSelect = webAccounts.find((webAccount) => {
                    return (
                        !webAccount.loginDelayedUntilSelected
                        &&
                        !webAccount.loginDelayedSeconds
                    );
                });
                draftState.selectedLogin = webAccountToSelect && webAccountToSelect.accountConfig.login;
            }

            draftState.accounts = webAccounts;
            draftState.initialized = true;
        },
        Select({login}) {
            draftState.selectedLogin = login;
        },
        DeSelect({login}) {
            if (draftState.selectedLogin === login) {
                delete draftState.selectedLogin;
            }
        },
        PatchProgress(payload) {
            const {account} = pickAccountBundle(draftState.accounts, payload);
            account.progress = {...account.progress, ...payload.patch};
        },
        Patch({login, patch, ignoreNoAccount}) {
            logger.verbose("(Patch)", JSON.stringify({patch}));

            let account: WebAccount | undefined;

            try {
                const bundle = pickAccountBundle(draftState.accounts, {login});
                account = bundle.account; // eslint-disable-line prefer-destructuring
            } catch (error) {
                if (error === notFoundAccountError && ignoreNoAccount) {
                    return;
                }
                throw error;
            }

            if ("notifications" in patch) {
                account.notifications = {...account.notifications, ...patch.notifications};

                if (!account.loggedInOnce && account.notifications.loggedIn) {
                    account.loggedInOnce = true;
                }
            }
            if ("syncingActivated" in patch) {
                account.syncingActivated = patch.syncingActivated;
            }
            if ("loginFilledOnce" in patch) {
                account.loginFilledOnce = patch.loginFilledOnce;
            }
            if ("loginDelayedSeconds" in patch) {
                account.loginDelayedSeconds = patch.loginDelayedSeconds;
            }
            if ("loginDelayedUntilSelected" in patch) {
                account.loginDelayedUntilSelected = patch.loginDelayedUntilSelected;
            }
        },
        PatchDbExportProgress({pk: {login}, uuid, progress}) {
            const {account} = pickAccountBundle(draftState.accounts, {login});
            const item = account.dbExportProgress.find((_) => _.uuid === uuid);

            if (typeof progress === "number") {
                if (item) {
                    item.progress = progress; // updating item
                } else {
                    account.dbExportProgress.push({uuid, progress}); // adding item
                }
            } else if (item) {
                account.dbExportProgress.splice( // removing item
                    account.dbExportProgress.indexOf(item),
                    1,
                );
            }
        },
        ToggleDatabaseView({login, forced}) {
            const {account} = pickAccountBundle(draftState.accounts, {login});

            account.databaseView = forced
                ? forced.databaseView
                : !account.databaseView;
        },
        PatchGlobalProgress({patch}) {
            draftState.globalProgress = {...draftState.globalProgress, ...patch};
        },
        FetchSingleMailSetParams({pk, mailPk}) {
            const {account} = pickAccountBundle(draftState.accounts, {login: pk.login});

            account.fetchSingleMailParams = mailPk
                ? {mailPk}
                : null;
        },
        MakeMailReadSetParams({pk, ...rest}) {
            const key = "makeReadMailParams";
            const {account} = pickAccountBundle(draftState.accounts, {login: pk.login});

            if ("messageIds" in rest) {
                const {messageIds} = rest;
                account[key] = {messageIds};
                return;
            }

            account[key] = null;
        },
        SetMailFolderParams({pk, ...rest}) {
            const key = "setMailFolderParams";
            const {account} = pickAccountBundle(draftState.accounts, {login: pk.login});

            if ("messageIds" in rest) {
                const {folderId, messageIds} = rest;
                account[key] = {folderId, messageIds};
                return;
            }

            account[key] = null;
        },
        default: () => draftState,
    }));
}
