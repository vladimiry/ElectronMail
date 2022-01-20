import {curryFunctionMembers} from "src/shared/util";
import {LOG_LEVELS} from "src/shared/constants";

const LOGGER = __ELECTRON_EXPOSURE__.Logger;

export const getWebLogger = (...args: string[]): typeof LOGGER => {
    const logger = {...curryFunctionMembers(LOGGER, ...args)};

    for (const level of LOG_LEVELS) {
        logger[level] = ((original) => {
            return function(
                this: typeof logger,
                ...loggerArgs: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
            ) {
                return original.apply(this, loggerArgs);
            };
        })(logger[level]);
    }

    return logger;
};
