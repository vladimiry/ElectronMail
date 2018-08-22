import {createFeatureSelector, createSelector} from "@ngrx/store";

import {accountPickingPredicate, pickBaseConfigProperties} from "src/shared/util";
import {featureName, State} from "src/web/src/app/store/reducers/options";
import {LoginFieldContainer} from "src/shared/model/container";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    config: createSelector(STATE, ({config}) => config),
    settings: createSelector(STATE, ({settings}) => settings),
    progress: createSelector(STATE, ({progress}) => progress),
    electronLocations: createSelector(STATE, ({electronLocations}) => electronLocations),
    hasSavedPassword: createSelector(STATE, ({hasSavedPassword}) => hasSavedPassword),
    activateBrowserWindowCounter: createSelector(STATE, ({activateBrowserWindowCounter}) => activateBrowserWindowCounter),
};

export const CONFIG = {
    base: createSelector(FEATURED.config, pickBaseConfigProperties),
    compactLayout: createSelector(FEATURED.config, ({compactLayout}) => compactLayout),
    unreadNotifications: createSelector(FEATURED.config, ({unreadNotifications}) => unreadNotifications),
};

export const SETTINGS = (() => {
    const accountsSelector = createSelector(FEATURED.settings, ({accounts}) => accounts);

    return {
        accounts: accountsSelector,
        pickAccount: (criteria: LoginFieldContainer) => createSelector(
            accountsSelector,
            (accounts) => accounts.find(accountPickingPredicate(criteria)),
        ),
        keePassClientConf: createSelector(FEATURED.settings, ({keePassClientConf}) => keePassClientConf),
        keePassRef: createSelector(FEATURED.settings, ({keePassRef}) => keePassRef),
    };
})();
