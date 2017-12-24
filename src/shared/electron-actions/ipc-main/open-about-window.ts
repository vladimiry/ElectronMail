import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.OpenAboutWindow;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: void;
    o: void;
}
