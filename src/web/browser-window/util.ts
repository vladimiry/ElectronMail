import {LOG_LEVELS} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";

const LOGGER = __ELECTRON_EXPOSURE__.Logger;

const formatZoneName = (): string => `<${Zone.current.name}>`;

type ZoneNameBoundWebLogger = typeof LOGGER & { zoneName: () => string };

export const getZoneNameBoundWebLogger = (...args: string[]): ZoneNameBoundWebLogger => {
    const logger = {...curryFunctionMembers(LOGGER, ...args)};
    const zoneName = formatZoneName;

    for (const level of LOG_LEVELS) {
        logger[level] = ((original) => {
            return function(
                this: typeof logger,
                ...loggerArgs: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
            ) {
                return original.apply(this, [zoneName()].concat(loggerArgs));
            };
        })(logger[level]);
    }

    return {...logger, zoneName};
};

// TODO consider building custom RxJS pipeable operator
export const logActionTypeAndBoundLoggerWithActionType = <P>(
    {_logger}: { _logger: ZoneNameBoundWebLogger }, level: keyof typeof LOGGER = "info",
): (pipeInput: { type: string; payload: P }) => { type: string; payload: P } & { logger: ZoneNameBoundWebLogger } => {
    return ( // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        action, // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    ) => {
        const logger = curryFunctionMembers(_logger, JSON.stringify({actionType: action.type}));

        logger[level]();

        return {
            ...action,
            logger,
        };
    };
};
