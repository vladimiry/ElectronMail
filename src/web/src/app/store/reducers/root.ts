import {Injector} from "@angular/core";
import {MetaReducer, Store} from "@ngrx/store";
import {RouterReducerState, routerReducer} from "@ngrx/router-store";
import {UnionOf} from "@vladimiry/unionize";

import {BuildEnvironment} from "src/shared/model/common";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/src/app/store/actions";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[reducers/root]");

// TODO join all actions in "src/web/src/app/store/actions" once
type Actions = UnionOf<typeof NAVIGATION_ACTIONS>;

export interface State {
    router?: RouterReducerState;
}

export const reducers = {
    router: routerReducer,
};

export function createErrorHandlingMetaReducer(injector: Injector): MetaReducer<State, Actions> {
    return (reducer) => {
        return (state, action) => {
            try {
                return reducer(state, action);
            } catch (error) {
                injector.get(Store).dispatch(NOTIFICATION_ACTIONS.Error(error));
            }
            return state as State;
        };
    };
}

export function createAppMetaReducer(): MetaReducer<State, Actions> {
    const development = (process.env.NODE_ENV as BuildEnvironment) === "development";

    return (reducer) => {
        return (state, action) => {
            if (development && typeof action.type === "string" && action.type) {
                logger.silly(action.type);
            }

            if (NAVIGATION_ACTIONS.is.Logout(action)) {
                return reducer(undefined, action);
            }

            return reducer(state, action);
        };
    };
}
