import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";
import {Config} from "_shared/model/options";

export const channel = IpcMainChannel.ToggleCompactLayout;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: void;
    o: Config;
}
