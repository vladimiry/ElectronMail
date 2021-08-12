import {Injector} from "@angular/core";
import type {MetaReducer} from "@ngrx/store";
import {Store} from "@ngrx/store";

import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {UnionOf} from "src/shared/ngrx-util";
import {getWebLogger} from "src/web/browser-window/util";

const logger = getWebLogger(__filename);

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface State {}

export const reducers = {};

export function createErrorHandlingMetaReducer(injector: Injector): MetaReducer<State, UnionOf<typeof NAVIGATION_ACTIONS>> {
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

export function createAppMetaReducer(): MetaReducer<State, UnionOf<typeof NAVIGATION_ACTIONS>> {
    const result: ReturnType<typeof createAppMetaReducer> = (reducer) => {
        return (state, action) => {
            if (BUILD_ENVIRONMENT === "development") { // eslint-disable-line sonarjs/no-collapsible-if
                if (typeof action.type === "string" && action.type) {
                    logger.silly(nameof(createAppMetaReducer), action.type);
                }
            }

            return reducer(state, action);
        };
    };
    return result;
}
