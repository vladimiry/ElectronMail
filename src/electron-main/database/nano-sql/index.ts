import {Table} from "../entity";
import {NanoSQLInstance} from "./sql-instance";

// tslint:disable-next-line:no-import-zones
export * from "nano-sql";

export {
    NanoSQLInstance,
};

const instance = new NanoSQLInstance();

export const nSQL = (table?: Table): NanoSQLInstance => {
    return instance.table(table) as NanoSQLInstance;
};
