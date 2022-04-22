import {filter} from "rxjs/operators";
import {timer} from "rxjs";

import {ONE_SECOND_MS} from "src/shared/const";

export const PING_ONLINE_STATUS_EVERY_SECOND$ = timer(0, ONE_SECOND_MS).pipe(
    filter(() => navigator.onLine),
);
