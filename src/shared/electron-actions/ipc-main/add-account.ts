import {AccountConfigPatch} from "_shared/model/container";
import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";
import {Settings} from "_shared/model/options";

export const channel = IpcMainChannel.AddAccount;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: AccountConfigPatch;
    o: Settings;
}
