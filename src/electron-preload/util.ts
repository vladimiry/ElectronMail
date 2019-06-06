import {LOGGER} from "src/electron-preload/electron-exposure/logger";
import {Logger} from "src/shared/model/common";
import {curryFunctionMembers} from "src/shared/util";

export function buildLoggerBundle(prefix: string): Logger {
    return curryFunctionMembers(LOGGER, prefix);
}
