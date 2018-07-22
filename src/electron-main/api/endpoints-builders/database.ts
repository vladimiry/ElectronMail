import {EMPTY, from} from "rxjs";

import {Endpoints} from "src/shared/api/main";
import {nSQL} from "src/electron-main/database/nano-sql";

export async function buildEndpoints(): Promise<Pick<Endpoints, "databaseUpsert">> {
    return {
        databaseUpsert: ({table, data}) => from((async () => {
            await nSQL(table).execUpsertQuery(data);
            return EMPTY.toPromise();
        })()),
    };
}
