import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";

import {
    AccountConfigCreateUpdatePatch, LoginFieldContainer, PasswordChangeContainer, PasswordFieldContainer,
} from "src/shared/model/container";
import {BaseConfig, Config, Settings} from "src/shared/model/options";
import {InitResponse} from "src/shared/api/main-process";
import {ProgressPatch, State} from "src/web/browser-window/app/store/reducers/options";
import {props, propsRecordToActionsRecord} from "src/shared/ngrx-util";

export const OPTIONS_ACTIONS = propsRecordToActionsRecord(
    {
        AddAccountRequest: props<AccountConfigCreateUpdatePatch>(),
        UpdateAccountRequest: props<AccountConfigCreateUpdatePatch>(),
        ChangeAccountOrderRequest: props<LoginFieldContainer & { index: number }>(),
        RemoveAccountRequest: props<{ login: string }>(),
        ChangeMasterPasswordRequest: props<PasswordChangeContainer>(),
        GetConfigRequest: null,
        GetConfigResponse: props<Config>(),
        GetSettingsRequest: null,
        GetSettingsResponse: props<Pick<Settings, "_rev" | "accounts">>(),
        InitRequest: null,
        InitResponse: props<InitResponse>(),
        PatchBaseSettingsRequest: props<BaseConfig>(),
        PatchProgress: props<ProgressPatch>(),
        ReEncryptSettings: props<{ password: string; encryptionPreset: PasswordBasedPreset }>(),
        SignInRequest: props<Partial<PasswordFieldContainer> & { savePassword?: boolean }>(),
        ToggleLocalDbMailsListViewMode: null,
        SetupMainProcessNotification: null,
        PatchMainProcessNotification: props<State["mainProcessNotification"]>(),
        ToggleAccountDisablingRequest: props<LoginFieldContainer>(),
        ResetDbMetadata: props<{ reset?: boolean }>(),
        ShouldUseDarkColors: props<{ shouldUseDarkColors: boolean }>(),
    },
    {prefix: __filename},
);
