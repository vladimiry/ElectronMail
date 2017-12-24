import {AddAccountRequest} from "./add-account-request";
import {AssociateSettingsWithKeePassRequest} from "./associate-with-keepass-request";
import {ChangeMasterPasswordRequest} from "./change-master-password-request";
import {GetConfigRequest} from "./get-config-request";
import {GetConfigResponse} from "./get-config-response";
import {GetSettingsRequest} from "./get-settings-request";
import {GetSettingsAutoRequest} from "./get-settings-auto-request";
import {GetSettingsResponse} from "./get-settings-response";
import {InitRequest} from "./init-request";
import {InitResponse} from "./init-response";
import {PatchProgress} from "./patch-progress";
import {RemoveAccountRequest} from "./remove-account-request";
import {SignInRequest} from "./signin-in-request";
import {ToggleCompactRequest} from "./toggle-compact-request";
import {UpdateAccountRequest} from "./update-account-request";

export {
    AddAccountRequest,
    AssociateSettingsWithKeePassRequest,
    ChangeMasterPasswordRequest,
    GetConfigRequest,
    GetConfigResponse,
    GetSettingsRequest,
    GetSettingsAutoRequest,
    GetSettingsResponse,
    InitRequest,
    InitResponse,
    PatchProgress,
    RemoveAccountRequest,
    SignInRequest,
    ToggleCompactRequest,
    UpdateAccountRequest,
};

export type All =
    | AddAccountRequest
    | AssociateSettingsWithKeePassRequest
    | ChangeMasterPasswordRequest
    | GetConfigRequest
    | GetConfigResponse
    | GetSettingsRequest
    | GetSettingsAutoRequest
    | GetSettingsResponse
    | InitRequest
    | InitResponse
    | PatchProgress
    | RemoveAccountRequest
    | SignInRequest
    | ToggleCompactRequest
    | UpdateAccountRequest;
