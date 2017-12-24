import {LoginFieldContainer} from "_shared/model/container";
import {Settings} from "_shared/model/options";
import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.RemoveAccount;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: LoginFieldContainer;
    o: Settings;
}
