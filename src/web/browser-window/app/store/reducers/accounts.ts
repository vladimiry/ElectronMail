import {noop} from "remeda";
import {produce} from "immer";

import {accountPickingPredicate} from "src/shared/util";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import * as fromRoot from "src/web/browser-window/app/store/reducers/root";
import {getWebLogger} from "src/web/browser-window/util";
import {LoginFieldContainer} from "src/shared/model/container";
import {UnionOf} from "src/shared/util/ngrx";
import {WebAccount} from "src/web/browser-window/app/model";

const logger = getWebLogger(__filename);

export const featureName = "accounts";

export interface State extends fromRoot.State {
    selectedLogin?: string;
    initialized?: boolean;
    globalProgress: { indexing?: boolean/*, accountTogglingByEntryUrlChange?: boolean*/ };
    // TODO consider using "@ngrx/entity" library instead of dealing with a raw array
    accounts: WebAccount[];
}

const initialState: State = {
    accounts: [],
    globalProgress: {},
};

const resolveAccountByLogin = <T extends boolean>(
    accounts: WebAccount[],
    filterCriteria: LoginFieldContainer,
    strict: T,
): typeof strict extends true ? WebAccount : WebAccount | undefined => {
    const filterPredicate = accountPickingPredicate(filterCriteria);
    const webAccount: ReturnType<typeof resolveAccountByLogin> = accounts.find(({accountConfig}) => filterPredicate(accountConfig));

    if (!webAccount && strict) {
        throw new Error("Failed to resolve account");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    return webAccount as any;
};

export function reducer(state = initialState, action: UnionOf<typeof ACCOUNTS_ACTIONS> | UnionOf<typeof NAVIGATION_ACTIONS>): State {
    if (NAVIGATION_ACTIONS.is(action)) {
        return action.type === NAVIGATION_ACTIONS.Logout.type
            ? initialState
            : state;
    }

    return produce(state, (draftState) => {
        ACCOUNTS_ACTIONS.match(action, {
            WireUpConfigs({accountConfigs}) {
                const webAccounts = accountConfigs
                    .filter((accountConfig) => !accountConfig.disabled)
                    .reduce((accounts: WebAccount[], accountConfig) => {
                        const account = resolveAccountByLogin(draftState.accounts, accountConfig, false);

                        if (account) {
                            account.accountConfig = accountConfig;
                            if (!account.accountConfig.database) {
                                delete account.databaseView;
                            }
                            accounts.push(account);
                        } else {
                            const webAccount: WebAccount = {
                                accountIndex: -1,
                                accountConfig,
                                progress: {},
                                notifications: {
                                    unread: 0,
                                    loggedIn: false,
                                    loggedInCalendar: false,
                                    pageType: {url: "", type: "unknown"},
                                },
                                dbExportProgress: [],
                                webviewSrcValues: {
                                    calendar: "",
                                    primary: ""
                                },
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

                webAccounts.forEach((webAccount, index) => webAccount.accountIndex = index);

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
            PatchProgress({login, patch, optionalAccount}) {
                logger.verbose(nameof.full(ACCOUNTS_ACTIONS.PatchProgress), JSON.stringify({patch, optionalAccount}));

                const account = resolveAccountByLogin(draftState.accounts, {login}, !optionalAccount);

                if (!account) {
                    logger.verbose(nameof.full(ACCOUNTS_ACTIONS.PatchProgress), "reducing skipped");
                    return;
                }

                const syncingToggled = "syncing" in patch && account.progress.syncing !== patch.syncing;

                account.progress = {...account.progress, ...patch};

                if (syncingToggled) {
                    delete account.progress.syncProgress;
                }
            },
            Patch({login, patch, optionalAccount}) {
                logger.verbose(nameof.full(ACCOUNTS_ACTIONS.Patch), JSON.stringify({patch, optionalAccount}));

                const account = resolveAccountByLogin(draftState.accounts, {login}, !optionalAccount);

                if (!account) {
                    logger.verbose(nameof.full(ACCOUNTS_ACTIONS.Patch), "reducing skipped");
                    return;
                }

                if ("webviewSrcValues" in patch) {
                    account.webviewSrcValues = {...account.webviewSrcValues, ...patch.webviewSrcValues};
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
                const account = resolveAccountByLogin(draftState.accounts, {login}, true);
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
                const account = resolveAccountByLogin(draftState.accounts, {login}, true);

                account.databaseView = forced
                    ? forced.databaseView
                    : !account.databaseView;
            },
            PatchGlobalProgress({patch}) {
                draftState.globalProgress = {...draftState.globalProgress, ...patch};
            },
            default: noop,
        });
    });
}
