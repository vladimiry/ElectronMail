import {ofType, unionize} from "unionize";
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {
    AccountConfigCreatePatch,
    AccountConfigPatch,
    PasswordChangeContainer,
    PasswordFieldContainer,
    UrlFieldContainer,
} from "_@shared/model/container";
import {BaseConfig, Config, Settings} from "_@shared/model/options";
import {ElectronContextLocations} from "_@shared/model/electron";
import {ProgressPatch} from "_@web/src/app/store/reducers/options";

export const OPTIONS_ACTIONS = unionize({
        AddAccountRequest: ofType<AccountConfigCreatePatch>(),
        AssociateSettingsWithKeePassRequest: ofType<UrlFieldContainer>(),
        ChangeMasterPasswordRequest: ofType<PasswordChangeContainer>(),
        GetConfigRequest: ofType<{}>(),
        GetConfigResponse: ofType<Config>(),
        GetSettingsAutoRequest: ofType<{}>(),
        GetSettingsRequest: ofType<{}>(),
        GetSettingsResponse: ofType<Settings>(),
        InitRequest: ofType<{}>(),
        InitResponse: ofType<{ electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>(),
        PatchBaseSettingsRequest: ofType<BaseConfig>(),
        PatchProgress: ofType<ProgressPatch>(),
        ReEncryptSettings: ofType<{ password: string, encryptionPreset: EncryptionAdapterOptions }>(),
        RemoveAccountRequest: ofType<{ login: string }>(),
        SignInRequest: ofType<PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean }>(),
        ToggleCompactRequest: ofType<{}>(),
        UpdateAccountRequest: ofType<AccountConfigPatch>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "options:",
    },
);
