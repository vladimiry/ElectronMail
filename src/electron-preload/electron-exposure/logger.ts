import {IFileTransport} from "electron-log"; // tslint:disable-line:no-import-zones
import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {Logger} from "src/shared/model/common";
import {ReadonlyDeep} from "type-fest"; // tslint:disable-line:no-import-zones

const logger: ReadonlyDeep<Logger & { transports: { file: IFileTransport } }> = remote.require("electron-log");

export const LOGGER: Logger = {
    error: log.bind(null, "error"),
    warn: log.bind(null, "warn"),
    info: log.bind(null, "info"),
    verbose: log.bind(null, "verbose"),
    debug: log.bind(null, "debug"),
    silly: log.bind(null, "silly"),
};

const LOGGER_LEVELS_WEIGHT: Readonly<Record<keyof Logger | "null" | "undefined" | "false", number>> = {
    null: -1,
    undefined: -1,
    false: -1,
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5,
};

function log(level: keyof Logger, ...params: any[]): void {
    if (
        LOGGER_LEVELS_WEIGHT[level]
        >
        LOGGER_LEVELS_WEIGHT[String(logger.transports.file.level) as keyof typeof LOGGER_LEVELS_WEIGHT]
    ) {
        return;
    }

    logger[level](...params);
}
