import {BehaviorSubject} from "rxjs";

import {Endpoints, IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {Unpacked} from "src/shared/types";

type Notification = Unpacked<ReturnType<Endpoints["notification"]>>;
type DbIndexerNotification = Unpacked<ReturnType<Endpoints["dbIndexerNotification"]>>;

export const NOTIFICATION_SUBJECT = new BehaviorSubject<Notification>(
    IPC_MAIN_API_NOTIFICATION_ACTIONS.DbIndexingState({status: "undefined"}),
);

export const DB_INDEXER_NOTIFICATION_SUBJECT = new BehaviorSubject<DbIndexerNotification>(
    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Stub(),
);
