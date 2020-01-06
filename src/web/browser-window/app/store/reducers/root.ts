import {Injector} from "@angular/core";
import {MetaReducer, Store} from "@ngrx/store";
import {UnionOf} from "@vladimiry/unionize";

import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

const logger = getZoneNameBoundWebLogger("[reducers/root]");

// TODO join all actions in "src/web/src/app/store/actions" once
type Actions = UnionOf<typeof NAVIGATION_ACTIONS>;

export interface State {

}

export const reducers = {

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
    return (reducer) => {
        return (state, action) => {
            // tslint:disable-next-line:no-collapsible-if
            if (BUILD_ENVIRONMENT === "development") {
                if (typeof action.type === "string" && action.type) {
                    logger.silly(action.type);
                }
            }

            return reducer(state, action);
        };
    };
}
