import {props} from "@ngrx/store";

import * as DbModel from "src/shared/model/database";
import {propsRecordToActionsRecord} from "src/shared/ngrx-util";

export const IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS = propsRecordToActionsRecord(
    {
        Bootstrapped: null,
        ProgressState: props<{
            key: DbModel.DbAccountPk;
            status: { indexing?: boolean };
        } | {
            status: {
                indexing?: boolean;
            };
        }>(),
        IndexingResult: props<{
            uid: string;
        }>(),
        SearchResult: props<{
            data: ReturnType<DbModel.MailsIndex["search"]>;
            uid: string;
        }>(),
        ErrorMessage: props<{ message: string }>(),
    },
    {prefix: __filename},
);
