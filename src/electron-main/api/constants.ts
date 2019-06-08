import {Subject} from "rxjs";
import {UnionOf} from "@vladimiry/unionize";

import {IPC_MAIN_API_DB_INDEXER_ON_ACTIONS, IpcMainServiceScan} from "src/shared/api/main";

export const IPC_MAIN_API_NOTIFICATION$ = new Subject<IpcMainServiceScan["ApiImplReturns"]["notification"]>();

export const IPC_MAIN_API_DB_INDEXER_NOTIFICATION$ = new Subject<IpcMainServiceScan["ApiImplReturns"]["dbIndexerNotification"]>();

export const IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$ = new Subject<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>>();
