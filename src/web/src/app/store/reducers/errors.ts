import {Action, createFeatureSelector, createSelector} from "@ngrx/store";

import {ERRORS_LIMIT} from "_@web/src/app/app.constants";
import * as fromRoot from "_@web/src/app/store/reducers/root";
import {CoreActions} from "_@web/src/app/store/actions";

export const featureName = "errors";

export interface State extends fromRoot.State {
    errors: Error[];
}

const initialState: State = {
    errors: [],
};

export function reducer(state = initialState, action: Action): State {
    switch (action.type) {
        case CoreActions.Fail.type: {
            const error = (action as CoreActions.Fail).error;
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
        }
        case CoreActions.RemoveError.type: {
            const error = (action as CoreActions.RemoveError).error;
            const errors = [...state.errors];
            const index = errors.indexOf(error);

            if (index !== -1) {
                errors.splice(index, 1);
            }

            return {
                ...state,
                errors,
            };
        }
        default: {
            return state;
        }
    }
}

export const stateSelector = createFeatureSelector<State>(featureName);
export const errorsSelector = createSelector(stateSelector, ({errors}) => errors);
