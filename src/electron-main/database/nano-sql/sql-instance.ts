// tslint:disable-next-line:no-import-zones
import {NanoSQLInstance} from "nano-sql";

class NanoSQLInstanceExt extends NanoSQLInstance {

}

export {
    // exporting with the same "NanoSQLInstance" name as defined in original module
    NanoSQLInstanceExt as NanoSQLInstance,
};
