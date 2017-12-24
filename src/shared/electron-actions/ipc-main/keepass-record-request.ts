import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";
import {
    KeePassClientConfFieldContainer,
    KeePassRefFieldContainer,
    MessageFieldContainer,
    PasswordFieldContainer,
} from "_shared/model/container";

export const channel = IpcMainChannel.KeePassRecordRequest;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: KeePassRefFieldContainer & KeePassClientConfFieldContainer & { suppressErrors: boolean };
    o: Partial<PasswordFieldContainer & MessageFieldContainer>;
}
