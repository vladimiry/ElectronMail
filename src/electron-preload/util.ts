// TODO don't import "electron-log" in rendered process but use IPC interaction instead (see "web"module for example)
import electronLog from "electron-log"; // tslint:disable-line:no-import-zones

import {curryFunctionMembers} from "src/shared/util";

export function buildLoggerBundle(prefix: string) {
    return curryFunctionMembers(electronLog, prefix);
}
