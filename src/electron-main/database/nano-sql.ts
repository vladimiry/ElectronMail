import {NanoSQLInstance} from "nano-sql";

import * as DatabaseModel from "src/shared/model/database";
import {EntityTable} from "src/shared/model/database";
import {Omit} from "src/shared/types";

export * from "nano-sql";

// override/extend default NanoSQLInstance here
class NanoSQLInstanceExt extends NanoSQLInstance {
    async execUpsertQuery<T extends DatabaseModel.BasePersisted>(data: (T | T[]) | (Omit<T, "pk"> | Array<Omit<T, "pk">>)): Promise<void> {
        await this.query("upsert", data).exec();
        return;
    }
}

export {
    NanoSQLInstanceExt,
    NanoSQLInstanceExt as NanoSQLInstance,
};

const instance = new NanoSQLInstanceExt();

export const nSQL = (table?: EntityTable): NanoSQLInstanceExt => {
    return instance.table(table) as NanoSQLInstanceExt;
};
