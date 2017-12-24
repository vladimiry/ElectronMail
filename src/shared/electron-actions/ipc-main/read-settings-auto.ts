import {Settings} from "_shared/model/options";
import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.ReadSettingsAuto;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: void;
    o: Settings | undefined;
}
