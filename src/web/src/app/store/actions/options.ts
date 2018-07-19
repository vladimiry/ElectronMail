import {ofType, unionize} from "unionize";
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {
    AccountConfigCreatePatch,
    AccountConfigUpdatePatch,
    PasswordChangeContainer,
    PasswordFieldContainer,
    UrlFieldContainer,
} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {ElectronContextLocations} from "src/shared/model/electron";
import {ProgressPatch} from "src/web/src/app/store/reducers/options";

export const OPTIONS_ACTIONS = unionize({
        AddAccountRequest: ofType<AccountConfigCreatePatch>(),
        AssociateSettingsWithKeePassRequest: ofType<UrlFieldContainer>(),
        ChangeMasterPasswordRequest: ofType<PasswordChangeContainer>(),
        GetConfigRequest: ofType<{}>(),
        GetConfigResponse: ofType<Config>(),
        GetSettingsRequest: ofType<{}>(),
        GetSettingsResponse: ofType<Settings>(),
        InitRequest: ofType<{}>(),
        InitResponse: ofType<{ electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>(),
        PatchBaseSettingsRequest: ofType<BaseConfig>(),
        PatchProgress: ofType<ProgressPatch>(),
        ReEncryptSettings: ofType<{ password: string, encryptionPreset: EncryptionAdapterOptions }>(),
        RemoveAccountRequest: ofType<{ login: string }>(),
        SignInRequest: ofType<Partial<PasswordFieldContainer> & { savePassword?: boolean; }>(),
        ToggleCompactRequest: ofType<{}>(),
        UpdateAccountRequest: ofType<AccountConfigUpdatePatch>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "options:",
    },
);
