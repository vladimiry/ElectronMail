import {LoginFieldContainer} from "_shared/model/container";
import {ElectronIpcRendererActionType, IpcRendererChannel} from "_shared/electron-actions/model";

export const channel = IpcRendererChannel.AccountFillLogin;

export interface Type extends ElectronIpcRendererActionType {
    c: typeof channel;
    i: LoginFieldContainer;
    o: { message: string };
}
