import {createFeatureSelector, createSelector} from "@ngrx/store";
import {UnionOf} from "unionize";

import * as fromRoot from "_@web/src/app/store/reducers/root";
import {CORE_ACTIONS} from "_@web/src/app/store/actions";
import {ERRORS_LIMIT} from "_@web/src/app/app.constants";

export const featureName = "errors";

export interface State extends fromRoot.State {
    errors: Error[];
}

const initialState: State = {
    errors: [],
};

export function reducer(state = initialState, action: UnionOf<typeof CORE_ACTIONS>): State {
    return CORE_ACTIONS.match(action, {
        Fail: (error) => {
            const errors = [...state.errors];

            // tslint:disable:no-console
            console.error(error);
            // tslint:enable:no-console

            // TODO indicate in the UI that only the most recent "50 / ${ERRORS_LIMIT}" errors are shown
            if (errors.length >= ERRORS_LIMIT) {
                errors.splice(0, 1, error);
            } else {
                errors.push(error);
            }

            return {
                ...state,
                errors,
            };
        },
        RemoveError: (error) => {
            const errors = [...state.errors];
            const index = errors.indexOf(error);

            if (index !== -1) {
                errors.splice(index, 1);
            }

            return {
                ...state,
                errors,
            };
        },
        default: () => state,
    });
}

export const stateSelector = createFeatureSelector<State>(featureName);
export const errorsSelector = createSelector(stateSelector, ({errors}) => errors);
