import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";
import {PasswordFieldContainer} from "_shared/model/container";
import {Settings} from "_shared/model/options";

export const channel = IpcMainChannel.ReEncryptSettings;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: PasswordFieldContainer & { encryptionPreset: EncryptionAdapterOptions };
    o: Settings;
}
