import {FileTransport} from "electron-log"; // tslint:disable-line:no-import-zones
import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {LogLevel, Logger} from "src/shared/model/common";
import {ReadonlyDeep} from "type-fest";
import {logLevelEnabled} from "src/shared/util";

const logger: ReadonlyDeep<Logger & { transports: { file: FileTransport } }> = remote.require("electron-log");

export const LOGGER: Logger = {
    error: log.bind(null, "error"),
    warn: log.bind(null, "warn"),
    info: log.bind(null, "info"),
    verbose: log.bind(null, "verbose"),
    debug: log.bind(null, "debug"),
    silly: log.bind(null, "silly"),
};

function log(level: LogLevel, ...params: any[]): void {
    if (!logLevelEnabled(level, logger)) {
        return;
    }

    logger[level](...params);
}
