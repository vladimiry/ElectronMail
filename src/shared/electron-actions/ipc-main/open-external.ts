import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.OpenExternal;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: {url: string};
    o: void;
}
