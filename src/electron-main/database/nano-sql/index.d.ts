import {_NanoSQLQuery, IdbQuery} from "nano-sql/lib/query/std-query";

import * as Model from "src/shared/model/database";
import {Table} from "src/electron-main/database/entity";
import {NanoSQLInstance as NanoSQLInstanceExt} from "./sql-instance";

type NanoSQLQuery = _NanoSQLQuery & {
    _query: IdbQuery & { table: Table };
};

declare module "nano-sql" {
    interface NanoSQLInstance {
        table(table?: Table): NanoSQLInstanceExt;

        query(...args: any[]): NanoSQLQuery & {
            exec(): Promise<void>;
        };

        query<T extends Model.Persistent>(action: "upsert", entity: T): NanoSQLQuery & {
            exec(): Promise<void>;
        };

        query(action: "select", args?: any): NanoSQLQuery & {
            exec<T extends Model.Persistent>(): Promise<T[]>;
        };
    }
}
