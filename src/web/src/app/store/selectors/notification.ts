import {createFeatureSelector, createSelector} from "@ngrx/store";

import {State, featureName} from "src/web/src/app/store/reducers/notification";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    items: createSelector(STATE, ({items}) => items),
};
