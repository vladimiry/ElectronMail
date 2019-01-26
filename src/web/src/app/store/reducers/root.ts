import {MetaReducer} from "@ngrx/store";
import {RouterReducerState, routerReducer} from "@ngrx/router-store";
import {UnionOf} from "@vladimiry/unionize";

import {AppErrorHandler} from "src/web/src/app/app.error-handler.service";
import {BuildEnvironment} from "src/shared/model/common";
import {CORE_ACTIONS, NAVIGATION_ACTIONS, ROOT_ACTIONS} from "src/web/src/app/store/actions";
import {State as ErrorsState} from "src/web/src/app/store/reducers/errors";
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

export function getMetaReducers(appErrorHandler: AppErrorHandler): Array<MetaReducer<State | ErrorsState, Actions>> {
    const result: Array<MetaReducer<State, Actions>> = [
        (reducer) => {
            return (state, action) => {
                try {
                    return reducer(state, action);
                } catch (error) {
                    // console.log(error);
                    // return errorReducer(state as ErrorsState, CORE_ACTIONS.Fail(error));
                    // store.dispatch(CORE_ACTIONS.Fail(error));
                    appErrorHandler.handleError(error);
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
