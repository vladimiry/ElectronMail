import {ElectronIpcMainActionType} from "_shared/electron-actions/model";

// @formatter:off
export interface ElectronWindow {
    __ELECTRON_EXPOSURE__: {
        ipcRenderer: {
            on(
                channel: string,
                listener: (event: string, response: ElectronTransport<ElectronIpcMainActionType>) => void,
            ): any;

            removeListener(
                channel: string,
                listener: (event: string, response: ElectronTransport<ElectronIpcMainActionType>) => void,
            ): any;

            send(channel: string, ...args: any[]): void;

            sendToHost(channel: string, ...args: any[]): void;
        };
    };
}
// @formatter:on

export interface ElectronTransportError {
    message: string;
    stackFrames: StackTrace.StackFrame[];
}

export interface ElectronTransport<T> {
    id: number;
    payload: T;
    error?: ElectronTransportError;
}

export type Environment = "production" | "development" | "e2e";

export interface ElectronContextLocations {
    readonly app: string;
    readonly data: string;
    readonly page: string;
    readonly icon: string;
    readonly preload: {
        readonly browser: Record<Environment, string>;
        readonly account: string;
    };
}
