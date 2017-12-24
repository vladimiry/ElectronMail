import {LoginFieldContainer, PasswordFieldContainer} from "_shared/model/container";
import {ElectronIpcRendererActionType, IpcRendererChannel} from "_shared/electron-actions/model";

export const channel = IpcRendererChannel.AccountLogin;

export interface Type extends ElectronIpcRendererActionType {
    c: typeof channel;
    i: LoginFieldContainer & PasswordFieldContainer;
    o: { message: string };
}
