import {FileTransport} from "electron-log"; // tslint:disable-line:no-import-zones
import {pick} from "remeda";
import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {LogLevel, Logger} from "src/shared/model/common";
import {isProtonApiError, sanitizeProtonApiError} from "src/electron-preload/lib/util";
import {logLevelEnabled} from "src/shared/util";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const logger: DeepReadonly<Logger & { transports: { file: FileTransport } }> = remote.require("electron-log");

const isDOMException = (error: unknown | DOMException): error is DOMException => {
    return (
        error instanceof DOMException
        ||
        (
            typeof error === "object"
            &&
            (
                (error as { name?: string }).name === "DOMException"
                ||
                (error as { constructor?: { name?: string } }).constructor?.name === "DOMException"
            )
        )
    );
};

function log(
    level: LogLevel,
    ...params: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
): void {
    if (!logLevelEnabled(level, logger)) {
        return;
    }

    try {
        logger[level](...params);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Sending error to main process for logging failed (likely due to the serialization issue):", error);
        // eslint-disable-next-line no-console
        console.error("Original error args:", level, ...params);
    }
}

const sanitizeLoggedArgument = (arg: unknown): unknown => {
    if (isProtonApiError(arg)) {
        return sanitizeProtonApiError(arg);
    }
    if (isDOMException(arg)) {
        // proton v4: some fetch requests get aborted which raises the error like: "DOMException: The user aborted a request"
        // proton v4: DOMException seems to be occuring in along with "409 (Conflict)" http request error
        // electron: DOMException error is not serializable via the electron's IPC
        return pick(arg, ["code", "message", "name"]);
    }
    return arg;
};

export const LOGGER: Logger = (["error", "warn", "info", "verbose", "debug", "silly"] as const).reduce(
    (accumulator, level) => {
        const doLog = log.bind(null, level);
        accumulator[level] = (...args: unknown[]) => {
            doLog(
                ...args.map(sanitizeLoggedArgument),
            );
        };
        return accumulator;
    },
    {} as Logger,
);
