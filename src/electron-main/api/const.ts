import {Subject} from "rxjs";

import {BINARY_NAME} from "src/shared/const";
import {IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS} from "src/shared/api/main-process/actions";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {UnionOf} from "src/shared/util/ngrx";

export const IPC_MAIN_API_NOTIFICATION$ = new Subject<IpcMainServiceScan["ApiImplReturns"]["notification"]>();

export const IPC_MAIN_API_DB_INDEXER_REQUEST$ = new Subject<IpcMainServiceScan["ApiImplReturns"]["dbIndexerNotification"]>();

export const IPC_MAIN_API_DB_INDEXER_RESPONSE$ = new Subject<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS>>();

export const QUICK_JS_EVAL_CODE_VARIABLE_NAME = `_QUICK_JS_EVAL_${BINARY_NAME}`
    .replaceAll("-", "_")
    .toUpperCase();
