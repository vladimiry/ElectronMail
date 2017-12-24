import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";
import {UrlFieldContainer} from "_shared/model/container";
import {Settings} from "_shared/model/options";

export const channel = IpcMainChannel.AssociateSettingsWithKeePass;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: UrlFieldContainer;
    o: Settings;
}
