import {MonoTypeOperatorFunction} from "rxjs";
import {UnionOf} from "unionize";
import {filter} from "rxjs/operators";

import {ACCOUNTS_ACTIONS} from "./accounts";
import {CORE_ACTIONS} from "./core";
import {NAVIGATION_ACTIONS} from "./navigation";
import {OPTIONS_ACTIONS} from "./options";
import {ROOT_ACTIONS} from "./root";

export {
    ACCOUNTS_ACTIONS,
    CORE_ACTIONS,
    NAVIGATION_ACTIONS,
    OPTIONS_ACTIONS,
    ROOT_ACTIONS,
};

export type Action =
    | UnionOf<typeof ACCOUNTS_ACTIONS>
    | UnionOf<typeof CORE_ACTIONS>
    | UnionOf<typeof NAVIGATION_ACTIONS>
    | UnionOf<typeof OPTIONS_ACTIONS>
    | UnionOf<typeof ROOT_ACTIONS>;

export function unionizeActionFilter<P>(
    predicate: (action: any) => action is { type: string, payload: P },
): MonoTypeOperatorFunction<{ type: string, payload: P }> {
    return filter((predicate));
}
