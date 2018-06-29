import {ActionReducer} from "@ngrx/store";
import {routerReducer, RouterReducerState} from "@ngrx/router-store";

import {BuildEnvironment} from "_@shared/model/common";
import {NAVIGATION_ACTIONS, ROOT_ACTIONS} from "_@web/src/app/store/actions";

export interface State {
    router?: RouterReducerState;
}

export const reducers = {
    router: routerReducer,
};

export function innerMetaReducer(this: ActionReducer<any, any>, state: any, action: any) {
    if (NAVIGATION_ACTIONS.match(action, {Logout: () => true, default: () => false})) {
        return this(undefined, action);
    }

    // TODO do not load HMR stuff for production build
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
