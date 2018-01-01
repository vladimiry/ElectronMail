import {Settings} from "_shared/model/options";
import {PasswordFieldContainer} from "_shared/model/container";
import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.ReadSettings;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean };
    o: Settings;
}
