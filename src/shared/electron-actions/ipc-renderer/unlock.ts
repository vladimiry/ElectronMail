import {MailPasswordFieldContainer} from "_shared/model/container";
import {ElectronIpcRendererActionType, IpcRendererChannel} from "_shared/electron-actions/model";

export const channel = IpcRendererChannel.AccountUnlock;

export interface Type extends ElectronIpcRendererActionType {
    c: typeof channel;
    i: MailPasswordFieldContainer;
    o: { message: string };
}
