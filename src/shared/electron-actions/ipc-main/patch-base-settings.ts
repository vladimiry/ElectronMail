import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";
import {Config, BaseConfig} from "_shared/model/options";

export const channel = IpcMainChannel.PatchBaseSettings;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: BaseConfig;
    o: Config;
}
