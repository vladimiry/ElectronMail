import {MonoTypeOperatorFunction} from "rxjs";
import {UnionOf} from "@vladimiry/unionize";
import {filter} from "rxjs/operators";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions/accounts";
import {DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions/db-view";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions/navigation";
import {NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions/notification";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions/options";

export {
    ACCOUNTS_ACTIONS,
    DB_VIEW_ACTIONS,
    NAVIGATION_ACTIONS,
    NOTIFICATION_ACTIONS,
    OPTIONS_ACTIONS,
};

export type AppAction =
    | UnionOf<typeof ACCOUNTS_ACTIONS>
    | UnionOf<typeof DB_VIEW_ACTIONS>
    | UnionOf<typeof NAVIGATION_ACTIONS>
    | UnionOf<typeof NOTIFICATION_ACTIONS>
    | UnionOf<typeof OPTIONS_ACTIONS>;

export function unionizeActionFilter<P>(
    predicate: (
        action: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ) => action is { type: string; payload: P },
): MonoTypeOperatorFunction<{ type: string; payload: P }> {
    return filter((predicate));
}
