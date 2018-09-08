import {createFeatureSelector, createSelector} from "@ngrx/store";

import {DbAccountPk} from "src/shared/model/database";
import {State, featureName} from "src/web/src/app/store/reducers/db-view";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    accountRecord: (pk: DbAccountPk, key = JSON.stringify(pk)) => createSelector(STATE, (state) => state.instances[key]),
};
