import {Subject} from "rxjs";
import {UnionOf} from "@vladimiry/unionize";

import {Endpoints, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS} from "src/shared/api/main";
import {Unpacked} from "src/shared/types";

export const USED_DATA_FOLDER_NAME_V2 = "email-securely-app";

export const IPC_MAIN_API_NOTIFICATION$ = new Subject<Unpacked<ReturnType<Endpoints["notification"]>>>();

export const IPC_MAIN_API_DB_INDEXER_NOTIFICATION$ = new Subject<Unpacked<ReturnType<Endpoints["dbIndexerNotification"]>>>();

export const IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$ = new Subject<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>>();
