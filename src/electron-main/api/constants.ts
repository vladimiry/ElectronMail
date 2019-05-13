import {Subject} from "rxjs";
import {UnionOf} from "@vladimiry/unionize";

import {EndpointsScan, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS} from "src/shared/api/main";

export const PACKAGE_NAME_V2 = "email-securely-app";

export const IPC_MAIN_API_NOTIFICATION$ = new Subject<EndpointsScan["ApiReturns"]["notification"]>();

export const IPC_MAIN_API_DB_INDEXER_NOTIFICATION$ = new Subject<EndpointsScan["ApiReturns"]["dbIndexerNotification"]>();

export const IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$ = new Subject<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>>();
