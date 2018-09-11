import {UnionOf} from "@vladimiry/unionize";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {CORE_ACTIONS} from "src/web/src/app/store/actions";
import {ERRORS_LIMIT} from "src/web/src/app/app.constants";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

export const featureName = "errors";

const logger = getZoneNameBoundWebLogger("[reducers/errors]");

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

            if (!errors.length || (errors[errors.length - 1].message !== error.message)) {
                // tslint:disable-next-line:no-console
                console.error(error);
                logger.error(error);
            }

            // TODO indicate in the UI that only the most recent "50 / ${ERRORS_LIMIT}" errors are shown
            if (errors.length >= ERRORS_LIMIT) {
                errors.splice(0, 1);
            }

            errors.push(error);

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
