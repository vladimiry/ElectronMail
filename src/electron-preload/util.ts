import electronLog from "electron-log"; // tslint:disable-line:no-import-zones

import {curryFunctionMembers} from "src/shared/util";

export const buildLoggerBundle = (prefix: string) => curryFunctionMembers(electronLog, prefix);
