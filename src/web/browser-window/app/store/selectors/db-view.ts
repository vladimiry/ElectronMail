import {createFeatureSelector, createSelector} from "@ngrx/store";

import {DbAccountPk} from "src/shared/model/database";
import {State, featureName} from "src/web/browser-window/app/store/reducers/db-view";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    instance: () => {
        return createSelector(
            STATE,
            ({instances}: State, {pk}: { pk: DbAccountPk }) => instances[JSON.stringify(pk)],
        );
    },
} as const;
