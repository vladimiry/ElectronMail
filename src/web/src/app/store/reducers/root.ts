import {Injector} from "@angular/core";
import {MetaReducer, Store} from "@ngrx/store";
import {RouterReducerState, routerReducer} from "@ngrx/router-store";
import {UnionOf} from "@vladimiry/unionize";

import {BuildEnvironment} from "src/shared/model/common";
import {CORE_ACTIONS, NAVIGATION_ACTIONS, ROOT_ACTIONS} from "src/web/src/app/store/actions";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[reducers/root]");

// TODO join all actions in "src/web/src/app/store/actions" once
type Actions = UnionOf<typeof ROOT_ACTIONS> & UnionOf<typeof NAVIGATION_ACTIONS> & UnionOf<typeof CORE_ACTIONS>;

export interface State {
    router?: RouterReducerState;
}

export const reducers = {
    router: routerReducer,
};

export function getMetaReducers(injector: Injector): Array<MetaReducer<State, Actions>> {
    const result: Array<MetaReducer<State, Actions>> = [
        (reducer) => {
            return (state, action) => {
                try {
                    return reducer(state, action);
                } catch (error) {
                    injector.get(Store).dispatch(CORE_ACTIONS.Fail(error));
                }
                return state as State;
            };
        },
        (reducer) => {
            return (state, action) => {
                if ((process.env.NODE_ENV as BuildEnvironment) === "development") {
                    if (typeof action.type === "string" && action.type) {
                        logger.silly(action.type);
                    }

                    if (ROOT_ACTIONS.is.HmrStateRestoreAction(action)) {
                        return action.payload;
                    }
                }

                if (NAVIGATION_ACTIONS.is.Logout(action)) {
                    return reducer(undefined, action);
                }

                return reducer(state, action);
            };
        },
    ];

    return result;
}
