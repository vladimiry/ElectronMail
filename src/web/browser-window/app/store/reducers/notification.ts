import {UnionOf} from "@vladimiry/unionize";
import {pick} from "remeda";
import {serializeError} from "serialize-error";

import * as fromRoot from "src/web/browser-window/app/store/reducers/root";
import {NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {NotificationItem} from "src/web/browser-window/app/store/actions/notification";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

export const featureName = "notification";

const logger = getZoneNameBoundWebLogger("[reducers/notification]");

const itemsLimit = 50;

function add(state: State, item: NotificationItem): State {
    const items = [...state.items];

    if (item.type === "error" || item.type === "errorMessage") {
        console.error(item); // eslint-disable-line no-console
    }

    if (item.type === "error") {
        logger.error(
            // WARN: make sure there is no circular recursive data
            serializeError(
                pick(item.data, ["name", "message", "stack"]),
            ),
        );
    }

    // TODO indicate in the UI that only the most recent ${itemsLimit} items are shown
    if (items.length >= itemsLimit) {
        items.splice(0, 1);
    }

    items.push(item);

    return {
        ...state,
        items,
    };
}

export interface State extends fromRoot.State {
    items: NotificationItem[];
}

const initialState: State = {
    items: [],
};

export function reducer(state = initialState, action: UnionOf<typeof NOTIFICATION_ACTIONS>): State {
    return NOTIFICATION_ACTIONS.match(action, {
        Error: (data) => add(state, {type: "error", data}),
        ErrorMessage: (data) => add(state, {type: "errorMessage", data}),
        Info: (data) => add(state, {type: "info", data}),
        Update: (data) => add(state, {type: "update", data}),
        Remove: (item) => {
            const items = [...state.items];
            const index = items.indexOf(item);

            if (index !== -1) {
                items.splice(index, 1);

                return {
                    ...state,
                    items,
                };
            }

            return state;
        },
        default: () => state,
    });
}
