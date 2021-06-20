import {pick} from "remeda";

import {LogLevel, Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/constants";
import {isProtonApiError, resolveIpcMainApi, sanitizeProtonApiError} from "src/electron-preload/lib/util";

let ipcMainApi: ReturnType<typeof resolveIpcMainApi> | undefined;

const getErrorPlainProps = <T>(error: T): T | { code: unknown, name: unknown, message: unknown, stack: unknown } => {
    if (typeof error !== "object") {
        return error;
    }
    // TODO consider also iterating "own string" props
    return pick(
        error as unknown as { code: unknown, name: unknown, message: unknown, stack: unknown },
        ["code", "message", "name", "stack"],
    );
};

function log(level: LogLevel, ...args: unknown[]): void {
    const api = ipcMainApi ??= resolveIpcMainApi({timeoutMs: ONE_SECOND_MS * 3});

    api("log")({level, args}).catch(() => {
        api("log")({level, args: args.map(getErrorPlainProps)}).catch((error) => {
            // eslint-disable-next-line no-console
            console.error("sending error to main process for logging failed (likely due to the serialization issue):", error);
            // eslint-disable-next-line no-console
            console.error("original error args:", level, ...args);
        });
    });
}

const sanitizeLoggedArgument = (arg: unknown): unknown => {
    if (isProtonApiError(arg)) {
        return sanitizeProtonApiError(arg);
    }
    return arg;
};

export const LOGGER: Logger = (["error", "warn", "info", "verbose", "debug", "silly"] as const).reduce(
    (accumulator, level) => {
        const doLog = log.bind(null, level);
        accumulator[level] = (...args: unknown[]) => {
            doLog(...args.map(sanitizeLoggedArgument));
        };
        return accumulator;
    },
    {} as Logger,
);
