import {createFeatureSelector, createSelector} from "@ngrx/store";

import {DEFAULT_TRAY_ICON_COLOR, DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/constants";
import {LoginFieldContainer} from "src/shared/model/container";
import {State, featureName} from "src/web/browser-window/app/store/reducers/options";
import {accountPickingPredicate, pickBaseConfigProperties} from "src/shared/util";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    config: createSelector(STATE, (state) => state.config),
    settings: createSelector(STATE, (state) => state.settings),
    progress: createSelector(STATE, (state) => state.progress),
    hasSavedPassword: createSelector(STATE, (state) => state.hasSavedPassword),
    keytarSupport: createSelector(STATE, (state) => state.keytarSupport),
    snapPasswordManagerServiceHint: createSelector(STATE, (state) => state.snapPasswordManagerServiceHint),
    mainProcessNotification: createSelector(STATE, (state) => state.mainProcessNotification),
    trayIconDataURL: createSelector(STATE, (state) => state.trayIconDataURL),
};

export const CONFIG = {
    base: createSelector(FEATURED.config, pickBaseConfigProperties),
    layoutMode: createSelector(FEATURED.config, (config) => config.layoutMode),
    unreadNotifications: createSelector(FEATURED.config, (config) => config.unreadNotifications),
    trayIconColor: createSelector(FEATURED.config, (config) => config.customTrayIconColor || DEFAULT_TRAY_ICON_COLOR),
    unreadBgColor: createSelector(FEATURED.config, (config) => config.customUnreadBgColor || DEFAULT_UNREAD_BADGE_BG_COLOR),
    unreadTextColor: createSelector(FEATURED.config, (config) => config.customUnreadTextColor || DEFAULT_UNREAD_BADGE_BG_TEXT),
    hideControls: createSelector(FEATURED.config, (config) => config.hideControls),
    timeouts: createSelector(FEATURED.config, (config) => config.timeouts),
    localDbMailsListViewMode: createSelector(FEATURED.config, (config) => config.localDbMailsListViewMode),
};

export const SETTINGS = (() => {
    const accountsSelector = createSelector(FEATURED.settings, ({accounts}) => accounts);

    return {
        accounts: accountsSelector,
        pickAccount: (criteria: LoginFieldContainer) => createSelector(
            accountsSelector,
            (accounts) => accounts.find(accountPickingPredicate(criteria)),
        ),
        localStoreEnabledCount: createSelector(
            accountsSelector,
            (accounts) => {
                return (accounts || []).reduce(
                    (accumulator, {database}) => accumulator + Number(Boolean(database)),
                    0,
                );
            }),
    };
})();
