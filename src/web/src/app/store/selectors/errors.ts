import {createFeatureSelector, createSelector} from "@ngrx/store";

import {featureName, State} from "src/web/src/app/store/reducers/errors";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    errors: createSelector(STATE, ({errors}) => errors),
};
