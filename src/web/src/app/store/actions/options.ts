import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import {ofType, unionize} from "@vladimiry/unionize";

import {
    AccountConfigCreatePatch,
    AccountConfigUpdatePatch,
    LoginFieldContainer,
    PasswordChangeContainer,
    PasswordFieldContainer,
} from "src/shared/model/container";
import {Arguments} from "src/shared/types";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {Endpoints, InitResponse} from "src/shared/api/main";
import {ProgressPatch, State} from "src/web/src/app/store/reducers/options";

export const OPTIONS_ACTIONS = unionize({
        AddAccountRequest: ofType<AccountConfigCreatePatch>(),
        UpdateAccountRequest: ofType<AccountConfigUpdatePatch>(),
        ChangeAccountOrderRequest: ofType<LoginFieldContainer & { index: number }>(),
        RemoveAccountRequest: ofType<{ login: string }>(),
        ChangeMasterPasswordRequest: ofType<PasswordChangeContainer>(),
        GetConfigRequest: ofType<{}>(),
        GetConfigResponse: ofType<Config>(),
        GetSettingsRequest: ofType<{}>(),
        GetSettingsResponse: ofType<Settings>(),
        InitRequest: ofType<{}>(),
        InitResponse: ofType<InitResponse>(),
        PatchBaseSettingsRequest: ofType<BaseConfig>(),
        PatchProgress: ofType<ProgressPatch>(),
        ReEncryptSettings: ofType<{ password: string, encryptionPreset: PasswordBasedPreset }>(),
        SignInRequest: ofType<Partial<PasswordFieldContainer> & { savePassword?: boolean; }>(),
        ToggleCompactRequest: ofType<{}>(),
        SetupMainProcessNotification: ofType<{}>(),
        PatchMainProcessNotification: ofType<State["mainProcessNotification"]>(),
        Migrate: ofType<Arguments<Endpoints["migrate"]>[0]>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "options:",
    },
);
