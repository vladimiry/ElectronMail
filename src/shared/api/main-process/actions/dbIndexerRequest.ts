import * as DbModel from "src/shared/model/database";
import {props, propsRecordToActionsRecord} from "src/shared/util/ngrx";

export const IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS = propsRecordToActionsRecord(
    {
        Bootstrap: null,
        // TODO consider splitting huge data portion to chunks, see "ramda.splitEvery"
        Index: props<{
            key: DbModel.DbAccountPk;
            remove: Array<Pick<DbModel.IndexableMail, "pk">>;
            add: DbModel.IndexableMail[];
            uid: string;
        }>(),
        Search: props<{ query: string, uid: string }>(),
    },
    {prefix: __filename},
);
