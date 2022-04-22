import {curryFunctionMembers} from "src/shared/util";
import {LOG_LEVELS} from "src/shared/const";
import {WebAccountPk} from "src/web/browser-window/app/model";

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

export const sha256 = async (input: string): Promise<string> => {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return new TextDecoder().decode(new Uint8Array(buffer));
};

export const resolveDbViewInstanceKey = ({login}: Pick<WebAccountPk, "login">): string => JSON.stringify(login);
