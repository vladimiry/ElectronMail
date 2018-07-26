import {ActionReducer} from "@ngrx/store";
import {routerReducer, RouterReducerState} from "@ngrx/router-store";

import {BuildEnvironment} from "src/shared/model/common";
import {getZoneNameBoundWebLogger} from "src/web/src/util";
import {NAVIGATION_ACTIONS, ROOT_ACTIONS} from "src/web/src/app/store/actions";

const logger = getZoneNameBoundWebLogger("[reducers/root]");

export interface State {
    router?: RouterReducerState;
}

export const reducers = {
    router: routerReducer,
};

export function innerMetaReducer(this: ActionReducer<any, any>, state: State, action: { type: string } & any) {
    if (typeof action.type === "string" && action.type) {
        logger.silly(action.type);
    }

    if (NAVIGATION_ACTIONS.match(action, {Logout: () => true, default: () => false})) {
        return this(undefined, action);
    }

    if ((process.env.NODE_ENV as BuildEnvironment) === "development") {
        return ROOT_ACTIONS.match(action, {
            HmrStateRestoreAction: (statePayload) => statePayload,
            default: () => this(state, action),
        });
    }

    return this(state, action);
}

export function hmrRootStateMetaReducer(reducer: ActionReducer<any, any>) {
    return innerMetaReducer.bind(reducer);
}

export const metaReducers = [
    hmrRootStateMetaReducer,
];
