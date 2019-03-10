import {LOGGER} from "src/web/src/logger-client";
import {LOG_LEVELS} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";

type ZoneNameBoundWebLogger = typeof LOGGER & { zoneName: () => string };

const formatZoneName = () => `<${Zone.current.name}>`;

export const getZoneNameBoundWebLogger = (...args: string[]): ZoneNameBoundWebLogger => {
    const logger = curryFunctionMembers(LOGGER, ...args);
    const zoneName = formatZoneName;

    for (const level of LOG_LEVELS) {
        logger[level] = ((original) => {
            return function(this: typeof logger) {
                return original.apply(this, [zoneName()].concat(Array.prototype.slice.call(arguments)));
            };
        })(logger[level]);
    }

    return {...logger, zoneName};
};

// TODO consider building custom RxJS pipeable operator
export const logActionTypeAndBoundLoggerWithActionType = <P extends object, T extends string>(
    {_logger}: { _logger: ZoneNameBoundWebLogger }, level: keyof typeof LOGGER = "info",
): (pipeInput: { type: string; payload: P }) => { type: string; payload: P } & { logger: ZoneNameBoundWebLogger } => {
    return (aciton) => {
        const logger = curryFunctionMembers(_logger, JSON.stringify({actionType: aciton.type}));

        logger[level]();

        return {
            ...aciton,
            logger,
        };
    };
};
