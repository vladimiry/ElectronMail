import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.ToggleBrowserWindow;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: { forcedState?: boolean };
    o: void;
}
