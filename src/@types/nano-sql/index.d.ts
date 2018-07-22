import * as DatabaseModel from "src/shared/model/database";
import {NanoSQLInstanceExt} from "src/electron-main/database/nano-sql";

// type NanoSQLQuery = _NanoSQLQuery & {
//     _query: IdbQuery & { table: EntityTable };
// };

declare module "nano-sql" {
    interface NanoSQLInstance {
        table(table?: DatabaseModel.EntityTable): NanoSQLInstanceExt;

        // query(action: "select", args?: any): /*NanoSQLQuery &*/ {
        //     exec<T extends DatabaseModel.BasePersisted>(): Promise<T[]>;
        // };
    }
}
