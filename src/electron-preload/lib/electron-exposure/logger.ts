import {pick} from "remeda";

import {LogLevel, Logger} from "src/shared/model/common";
import {isProtonApiError, resolveIpcMainApi, sanitizeProtonApiError} from "src/electron-preload/lib/util";

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
    ...args: unknown[]
): void {
    resolveIpcMainApi({})("log")({level, args}).catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Sending error to main process for logging failed (likely due to the serialization issue):", error);
        // eslint-disable-next-line no-console
        console.error("Original error args:", level, ...args);
    });
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
