import {createFeatureSelector, createSelector} from "@ngrx/store";

import {State, featureName} from "src/web/browser-window/app/store/reducers/db-view";
import {WebAccountPk} from "src/web/browser-window/app/model";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    instance() {
        return createSelector(
            STATE,
            ({instances}: State, {pk}: { pk: WebAccountPk }) => instances[JSON.stringify(pk)],
        );
    },
} as const;
