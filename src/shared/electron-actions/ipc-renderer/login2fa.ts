import {PasswordFieldContainer} from "_shared/model/container";
import {ElectronIpcRendererActionType, IpcRendererChannel} from "_shared/electron-actions/model";

export const channel = IpcRendererChannel.AccountLogin2FA;

export interface Type extends ElectronIpcRendererActionType {
    c: typeof channel;
    i: PasswordFieldContainer;
    o: { message: string };
}
