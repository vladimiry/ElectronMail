import {ActionReducer} from "@ngrx/store";
import {RouterReducerState, routerReducer} from "@ngrx/router-store";

import {BuildEnvironment} from "src/shared/model/common";
import {NAVIGATION_ACTIONS, ROOT_ACTIONS} from "src/web/src/app/store/actions";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[reducers/root]");

export interface State {
    router?: RouterReducerState;
}

export const reducers = {
    router: routerReducer,
};

type RawActionReducer = ActionReducer<any, any>;

export function innerMetaReducer(this: RawActionReducer, state: State, action: { type: string } & any) {
    if ((process.env.NODE_ENV as BuildEnvironment) === "development") {
        if (typeof action.type === "string" && action.type) {
            logger.silly(action.type);
        }

        if (ROOT_ACTIONS.is.HmrStateRestoreAction(action)) {
            return action.payload;
        }
    }

    if (NAVIGATION_ACTIONS.is.Logout(action)) {
        return this(undefined, action);
    }

    return this(state, action);
}

export function hmrRootStateMetaReducer(reducer: RawActionReducer) {
    return innerMetaReducer.bind(reducer);
}

export const metaReducers = [
    hmrRootStateMetaReducer,
];
