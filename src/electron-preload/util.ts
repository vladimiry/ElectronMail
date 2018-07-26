// tslint:disable-next-line:no-import-zones
import logger from "electron-log";

import {curryFunctionMembers} from "src/shared/util";

export const buildLoggerBundle = (prefix: string) => curryFunctionMembers(logger, prefix);
