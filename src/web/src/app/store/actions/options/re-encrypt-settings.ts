import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";
import {Action} from "@ngrx/store";

export class ReEncryptSettings implements Action {
    static readonly type = "options:re-encrypt-settings";
    readonly type = ReEncryptSettings.type;

    constructor(public password: string, public encryptionPreset: EncryptionAdapterOptions) {}
}
