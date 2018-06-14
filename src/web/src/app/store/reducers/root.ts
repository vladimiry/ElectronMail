import {ActionReducer} from "@ngrx/store";
import {routerReducer, RouterReducerState} from "@ngrx/router-store";

import {NavigationActions, Root} from "_web_src/app/store/actions";

export interface State {
    router?: RouterReducerState;
}

export const reducers = {
    router: routerReducer,
};

export function innerMetaReducer(this: ActionReducer<any, any>, state: any, action: any) {
    if (action.type === Root.HrmStateRestoreAction.type) {
        return (action as Root.HrmStateRestoreAction).state;
    }

    if (action.type === NavigationActions.Logout.type) {
        return this(undefined, action);
    }

    return this(state, action);
}

export function hrmRootStateMetaReducer(reducer: ActionReducer<any, any>) {
    return innerMetaReducer.bind(reducer);
}

export const metaReducers = [
    hrmRootStateMetaReducer,
];
