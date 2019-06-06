import {IFileTransport} from "electron-log"; // tslint:disable-line:no-import-zones
import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {Logger} from "src/shared/model/common";

const logger: Logger & { transports: { file: IFileTransport } } = remote.require("electron-log");

function log(level: keyof Logger, ...params: any[]): void {
    if (logger.transports.file.level !== level) {
        return;
    }
    logger[level](...params);
}

export const LOGGER: Logger = {
    error: log.bind(null, "error"),
    warn: log.bind(null, "warn"),
    info: log.bind(null, "info"),
    verbose: log.bind(null, "verbose"),
    debug: log.bind(null, "debug"),
    silly: log.bind(null, "silly"),
};
