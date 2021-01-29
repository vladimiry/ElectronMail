import {Injector} from "@angular/core";
import {MetaReducer, Store} from "@ngrx/store";
import {UnionOf} from "@vladimiry/unionize";

import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {getWebLogger} from "src/web/browser-window/util";

const logger = getWebLogger("[reducers/root]");

// TODO join all actions in "src/web/src/app/store/actions" once
type Actions = UnionOf<typeof NAVIGATION_ACTIONS>;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface State {}

export const reducers = {};

export function createErrorHandlingMetaReducer(injector: Injector): MetaReducer<State, Actions> {
    const result: ReturnType<typeof createErrorHandlingMetaReducer> = (reducer) => {
        return (state, action) => {
            try {
                return reducer(state, action);
            } catch (error) {
                injector.get(Store).dispatch(NOTIFICATION_ACTIONS.Error(error));
            }
            return state as State;
        };
    };
    return result;
}

export function createAppMetaReducer(): MetaReducer<State, Actions> {
    const result: ReturnType<typeof createAppMetaReducer> = (reducer) => {
        return (state, action) => {
            if (BUILD_ENVIRONMENT === "development") { // eslint-disable-line sonarjs/no-collapsible-if
                if (typeof action.type === "string" && action.type) {
                    logger.silly(action.type);
                }
            }

            return reducer(state, action);
        };
    };
    return result;
}
