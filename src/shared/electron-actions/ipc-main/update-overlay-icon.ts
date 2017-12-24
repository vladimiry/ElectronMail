import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.UpdateOverlayIcon;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: { count: number; dataURL?: string; };
    o: void;
}
