import logger, {LogLevel as ILogLevel} from "electron-log";

export type Timestamp = ReturnType<typeof Date.prototype.getTime>;

export interface EntryUrlItem {
    value: string;
    title: string;
}

export type NumberString = string;

export type Logger = Pick<typeof logger, ILogLevel>;

export type LogLevel = keyof Logger;

export type NumericBoolean = 0 | 1;
