import {createFeatureSelector, createSelector} from "@ngrx/store";

import {accountPickingPredicate, pickBaseConfigProperties} from "src/shared/util";
import {DEFAULT_TRAY_ICON_COLOR, DEFAULT_UNREAD_BADGE_BG_COLOR, DEFAULT_UNREAD_BADGE_BG_TEXT} from "src/shared/constants";
import {featureName, State} from "src/web/browser-window/app/store/reducers/options";
import {LoginFieldContainer} from "src/shared/model/container";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    config: createSelector(STATE, (state) => state.config),
    settings: createSelector(STATE, (state) => state.settings),
    progress: createSelector(STATE, (state) => state.progress),
    hasSavedPassword: createSelector(STATE, (state) => state.hasSavedPassword),
    keytarSupport: createSelector(STATE, (state) => state.keytarSupport),
    snapPasswordManagerServiceHint: createSelector(STATE, (state) => state.snapPasswordManagerServiceHint),
    mainProcessNotificationAction: createSelector(STATE, (state) => state.mainProcessNotification.action),
    trayIconDataURL: createSelector(STATE, (state) => state.trayIconDataURL),
    shouldUseDarkColors: createSelector(STATE, (state) => state.shouldUseDarkColors),
} as const;

export const CONFIG = {
    base: createSelector(FEATURED.config, pickBaseConfigProperties),
    layoutMode: createSelector(FEATURED.config, (config) => config.layoutMode),
    unreadNotifications: createSelector(FEATURED.config, (config) => config.unreadNotifications),
    trayIconColor: createSelector(FEATURED.config, (config) => config.customTrayIconColor || DEFAULT_TRAY_ICON_COLOR),
    unreadBgColor: createSelector(FEATURED.config, (config) => config.customUnreadBgColor || DEFAULT_UNREAD_BADGE_BG_COLOR),
    unreadTextColor: createSelector(FEATURED.config, (config) => config.customUnreadTextColor || DEFAULT_UNREAD_BADGE_BG_TEXT),
    hideControls: createSelector(FEATURED.config, (config) => config.hideControls),
    calendarNotification: createSelector(FEATURED.config, (config) => config.calendarNotification),
    timeouts: createSelector(FEATURED.config, (config) => config.timeouts),
    localDbMailsListViewMode: createSelector(FEATURED.config, (config) => config.localDbMailsListViewMode),
    doNotRenderNotificationBadgeValue: createSelector(FEATURED.config, (config) => config.doNotRenderNotificationBadgeValue),
    zoomFactorDisabled: createSelector(FEATURED.config, (config) => config.zoomFactorDisabled),
    persistentSessionSavingInterval: createSelector(FEATURED.config, (config) => config.persistentSessionSavingInterval),
} as const;

export const SETTINGS = (
    () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const accountsSelector = createSelector(FEATURED.settings, ({accounts}) => accounts);

        return {
            accounts: accountsSelector,
            pickAccount: (criteria: LoginFieldContainer) => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
                return createSelector(
                    accountsSelector,
                    (accounts) => accounts.find(accountPickingPredicate(criteria)),
                );
            },
            localStoreEnabledCount: createSelector(
                accountsSelector,
                (accounts) => {
                    return (accounts || []).reduce(
                        (accumulator, {database}) => accumulator + Number(Boolean(database)),
                        0,
                    );
                }),
        } as const;
    }
)();
