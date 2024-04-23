import {getPlainErrorProps} from "src/shared/util";
import {isProtonApiError, resolveIpcMainApi, sanitizeProtonApiError} from "src/electron-preload/lib/util";
import {Logger, LogLevel} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/const";

let apiClient: ReturnType<typeof resolveIpcMainApi> | undefined;

const resolveApiCallParameters = (input: Readonly<{level: LogLevel; args: unknown[]}>): {level: LogLevel; args: unknown[]} => {
    const level = input.level === "error"
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            && input.args.some((value) => Object(value).message === "Uncaught Error: An object could not be cloned.")
        ? "warn"
        : input.level;
    return {level, args: input.args};
};

const log = (level: LogLevel, ...args: unknown[]): void => {
    const apiCall = (apiClient ??= resolveIpcMainApi({timeoutMs: ONE_SECOND_MS * 3}))("log");

    apiCall(resolveApiCallParameters({level, args})).catch(async () => {
        // TODO re-call only if the "An object could not be cloned"-like error occurred
        return apiCall(resolveApiCallParameters({level, args: args.map((arg) => getPlainErrorProps(arg))})).catch(() => {
            // NOOP
        });
    });
};

const sanitizeLoggedArgument = (arg: unknown): unknown => {
    if (isProtonApiError(arg)) {
        return sanitizeProtonApiError(arg);
    }
    return arg;
};

export const LOGGER: Logger = (["error", "warn", "info", "verbose", "debug", "silly"] as const).reduce((accumulator, level) => {
    const doLog = log.bind(null, level);
    accumulator[level] = (...args: unknown[]) => {
        doLog(...args.map(sanitizeLoggedArgument));
    };
    return accumulator;
}, {} as Logger);
