import {ElectronTransport} from "_shared/model/electron";

// TODO get rid of the ElectronIpcMainEvent interface
// https://github.com/electron/electron-typescript-definitions/issues/27
export interface ElectronTransportEvent<T> {
    sender: {
        send: (event: string, payload: ElectronTransport<T>) => void;
    };
}
