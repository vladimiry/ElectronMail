import {EMPTY, from, of} from "rxjs";

import {Endpoints} from "src/shared/api/main";
import {nSQL} from "src/electron-main/database/nano-sql";

export async function buildEndpoints(): Promise<Pick<Endpoints, "databaseUpsert" | "databaseMailRawNewestTimestamp">> {
    return {
        databaseUpsert: ({table, data}) => from((async () => {
            await nSQL(table).execUpsertQuery(data);
            return EMPTY.toPromise();
        })()),

        databaseMailRawNewestTimestamp: ({type, login}) => from((async () => {
            if (type !== "tutanota") {
                throw new Error(`"databaseMailRawNewestTimestamp": not yet implemented for "${type}" email provider`);
            }

            const result = await nSQL("Mail")
                .query("select", ["id"])
                .where([["type", "=", type], "AND", ["login", "=", login]])
                .orderBy({id: "desc"})
                .limit(1)
                .exec() as Array<{ id: string }>;
            const value = (result.length && result[0].id) || undefined;

            return of({value}).toPromise();
        })()),
    };
}
