// tslint:disable-next-line:no-import-zones
import {LogLevel} from "electron-log";

import {LOG_LEVELS} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";

// TODO ban direct "__ELECTRON_EXPOSURE__.webLogger" referencing (using tslint), but only via "getZoneNameBoundWebLogger" call

export type ZoneNameBoundWebLogger = typeof __ELECTRON_EXPOSURE__.webLogger & { zoneName: () => string };

export const formatZoneName = () => `<${Zone.current.name}>`;

export const getZoneNameBoundWebLogger = (...args: string[]): ZoneNameBoundWebLogger => {
    const logger = curryFunctionMembers(__ELECTRON_EXPOSURE__.webLogger, ...args);
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

// TODO consider building own RxJS pipeable operator
export const logActionTypeAndBoundLoggerWithActionType = <P extends object, T extends string>(
    {_logger}: { _logger: ZoneNameBoundWebLogger }, level: LogLevel = "info",
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
