import {Arguments, Logger, Unpacked} from "src/shared/types";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";

const apiClient = __ELECTRON_EXPOSURE__.buildIpcMainClient({options: {timeoutMs: ONE_SECOND_MS * 3}});
const apiMethod = apiClient("log");

type Line = Unpacked<Arguments<IpcMainApiEndpoints["log"]>[0]>;

const callApiDebounce: {
    readonly delayMs: number,
    readonly lines: Line[];
    timeoutId?: any;
} = {
    delayMs: ONE_SECOND_MS,
    lines: [],
};

// TODO skip irrelevant levels by filtering "level" argument by value taken from the main process's logger
const log = async (level: Line["level"], ...dataArgs: Line["dataArgs"]) => {
    callApiDebounce.lines.push({level, dataArgs});
    clearTimeout(callApiDebounce.timeoutId);
    callApiDebounce.timeoutId = setTimeout(callApi, callApiDebounce.delayMs);
};

const callApi = () => {
    const lines = [...callApiDebounce.lines];

    callApiDebounce.lines.length = 0;

    (async () => {
        await apiMethod(lines);
    })().catch((error) => {
        console.error(error, JSON.stringify(lines)); // tslint:disable-line:no-console
    });
};

// TODO consider turning args from any to "() => any" and then execute the functions only if "level" is enabled (lazy args resolving)
export const LOGGER: Logger = {
    error: log.bind(null, "error"),
    warn: log.bind(null, "warn"),
    info: log.bind(null, "info"),
    verbose: log.bind(null, "verbose"),
    debug: log.bind(null, "debug"),
    silly: log.bind(null, "silly"),
};
