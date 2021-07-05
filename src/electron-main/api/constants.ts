import {Subject} from "rxjs";

import {IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS} from "src/shared/api/main-process/actions";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {UnionOf} from "src/shared/ngrx-util";

export const IPC_MAIN_API_NOTIFICATION$ = new Subject<IpcMainServiceScan["ApiImplReturns"]["notification"]>();

export const IPC_MAIN_API_DB_INDEXER_REQUEST$ = new Subject<IpcMainServiceScan["ApiImplReturns"]["dbIndexerNotification"]>();

export const IPC_MAIN_API_DB_INDEXER_RESPONSE$ = new Subject<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS>>();
