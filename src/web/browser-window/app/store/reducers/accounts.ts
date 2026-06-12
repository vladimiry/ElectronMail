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
    globalProgress: {indexing?: boolean /*, accountTogglingByEntryUrlChange?: boolean*/};
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
): T extends true ? WebAccount : WebAccount | undefined => {
    const filterPredicate = accountPickingPredicate(filterCriteria);
    const webAccount = accounts.find(({accountConfig}) => filterPredicate(accountConfig));
    if (strict && !webAccount) {
        throw new Error("Failed to resolve account");
    }
    return webAccount as T extends true ? WebAccount : WebAccount | undefined;
};

export function reducer(state = initialState, action: UnionOf<typeof ACCOUNTS_ACTIONS> | UnionOf<typeof NAVIGATION_ACTIONS>): State {
    if (NAVIGATION_ACTIONS.is(action)) {
        return action.type === NAVIGATION_ACTIONS.Logout.type
            ? initialState
            : state;
    }

    return produce(state, (draftState) => {
        ACCOUNTS_ACTIONS.match(action, {
            WireUpConfigs({accountConfigs, notSelectableLogins = new Set(), loginsToResetEnabledAccountsBy = new Set()}) {
                const enabledAccounts = accountConfigs
                    .filter(({disabled}) => !disabled)
                    .reduce((items: WebAccount[], accountConfig) => {
                        const existingItem = !loginsToResetEnabledAccountsBy.has(accountConfig.login)
                            ? resolveAccountByLogin(draftState.accounts, accountConfig, false)
                            : undefined;
                        if (existingItem) {
                            existingItem.accountConfig = accountConfig;
                            if (!existingItem.accountConfig.database) delete existingItem.databaseView;
                        }
                        return [
                            ...items,
                            existingItem ?? <WebAccount> {
                                accountIndex: -1,
                                accountConfig,
                                progress: {},
                                notifications: {unread: 0, loggedIn: false},
                                dbExportProgress: [],
                                webviewSrcValues: {primary: ""},
                            },
                        ];
                    }, []);
                const selectableLogins = new Set(
                    enabledAccounts
                        .filter((item) => (
                            // not "delayed" account
                            !(item.loginDelayedUntilSelected || typeof item.loginDelayedSeconds === "number")
                            // "delayed" account can be "selectable" if its webview has already been "navigated" with some "src"
                            || Object.values(item.webviewSrcValues).some(Boolean)
                        ))
                        .map(({accountConfig: {login}}) => login),
                ).difference(notSelectableLogins);

                // ensure "selected login" is filled with valid value
                if (!selectableLogins.size) {
                    delete draftState.selectedLogin;
                } else if (typeof draftState.selectedLogin !== "string" || !selectableLogins.has(draftState.selectedLogin)) {
                    [draftState.selectedLogin] = selectableLogins; // take first "selectable" value
                }

                // recalc indexes since number of accounts migh change dynamically
                enabledAccounts.forEach((item, index) => item.accountIndex = index);

                draftState.accounts = enabledAccounts;
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
            default() {
                // NOOP
            },
        });
    });
}
