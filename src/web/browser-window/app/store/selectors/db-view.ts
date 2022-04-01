import {createFeatureSelector, createSelector} from "@ngrx/store";

import {AccountConfig} from "src/shared/model/account";
import {featureName, State} from "src/web/browser-window/app/store/reducers/db-view";
import {resolveDbViewInstanceKey} from "src/web/browser-window/util";

export const STATE = createFeatureSelector<State>(featureName);

export const FEATURED = {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    instance() {
        return createSelector(
            STATE,
            ({instances}: State, login: AccountConfig["login"]) => instances[resolveDbViewInstanceKey({login})],
        );
    },
} as const;
