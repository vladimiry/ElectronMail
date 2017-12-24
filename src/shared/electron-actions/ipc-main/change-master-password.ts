import {Settings} from "_shared/model/options";
import {NewPasswordFieldContainer, PasswordFieldContainer} from "_shared/model/container";
import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";

export const channel = IpcMainChannel.ChangeMasterPassword;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: PasswordFieldContainer & NewPasswordFieldContainer;
    o: Settings;
}
