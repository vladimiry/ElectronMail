import {createFeatureSelector, createSelector} from "@ngrx/store";

import {DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/constants";
import {LoginFieldContainer} from "src/shared/model/container";
import {State, featureName} from "src/web/src/app/store/reducers/options";
import {accountPickingPredicate, pickBaseConfigProperties} from "src/shared/util";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    config: createSelector(STATE, (state) => state.config),
    settings: createSelector(STATE, (state) => state.settings),
    progress: createSelector(STATE, (state) => state.progress),
    electronLocations: createSelector(STATE, (state) => state.electronLocations),
    hasSavedPassword: createSelector(STATE, (state) => state.hasSavedPassword),
    keytarSupport: createSelector(STATE, (state) => state.keytarSupport),
    snapPasswordManagerServiceHint: createSelector(STATE, (state) => state.snapPasswordManagerServiceHint),
    mainProcessNotification: createSelector(STATE, (state) => state.mainProcessNotification),
    copyV2AppData: createSelector(STATE, (state) => state.copyV2AppData),
};

export const CONFIG = {
    base: createSelector(FEATURED.config, pickBaseConfigProperties),
    compactLayout: createSelector(FEATURED.config, (config) => config.compactLayout),
    unreadNotifications: createSelector(FEATURED.config, (config) => config.unreadNotifications),
    unreadBgColor: createSelector(FEATURED.config, (config) => config.customUnreadBgColor || DEFAULT_UNREAD_BADGE_BG_COLOR),
    unreadTextColor: createSelector(FEATURED.config, (config) => config.customUnreadTextColor || DEFAULT_UNREAD_BADGE_BG_TEXT),
    timeouts: createSelector(FEATURED.config, (config) => config.timeouts),
};

export const SETTINGS = (() => {
    const accountsSelector = createSelector(FEATURED.settings, ({accounts}) => accounts);

    return {
        accounts: accountsSelector,
        pickAccount: (criteria: LoginFieldContainer) => createSelector(
            accountsSelector,
            (accounts) => accounts.find(accountPickingPredicate(criteria)),
        ),
        localStoreEnabledCount: createSelector(accountsSelector, (accounts) => {
            return accounts.reduce(
                (accumulator, {database}) => accumulator + Number(Boolean(database)),
                0,
            );
        }),
    };
})();
