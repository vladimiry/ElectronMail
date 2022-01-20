import {createFeatureSelector, createSelector} from "@ngrx/store";

import {featureName, State} from "src/web/browser-window/app/store/reducers/notification";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    items: createSelector(STATE, ({items}) => items),
} as const;
