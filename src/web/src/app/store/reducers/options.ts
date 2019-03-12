import {UnionOf} from "@vladimiry/unionize";

import * as fromRoot from "./root";
import {Config, Settings} from "src/shared/model/options";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS, InitResponse} from "src/shared/api/main";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {Omit} from "src/shared/types";

export const featureName = "options";

export type ProgressPatch = Partial<{
    addingAccount: boolean;
    changingPassword: boolean;
    reEncryptingSettings: boolean;
    removingAccount: boolean;
    signingIn: boolean;
    loadingDatabase: boolean;
    togglingStore: boolean;
    togglingCompactLayout: boolean;
    updatingAccount: boolean;
    changingAccountOrder: boolean;
    updatingBaseSettings: boolean;
    migrating: boolean;
}>;

type OptionalProps = "keytarSupport" | "electronLocations";

export interface State extends fromRoot.State, Partial<Pick<InitResponse, OptionalProps>>, Omit<InitResponse, OptionalProps> {
    config: Config;
    settings: Settings;
    progress: ProgressPatch;
    hasSavedPassword?: boolean;
    mainProcessNotification: UnionOf<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS>;
}

const initialState: State = {
    config: {} as Config,
    settings: {} as Settings,
    progress: {},
    mainProcessNotification: {type: "ActivateBrowserWindow", payload: {}},
};

export function reducer(state = initialState, action: UnionOf<typeof OPTIONS_ACTIONS>): State {
    return OPTIONS_ACTIONS.match(action, {
        InitResponse: (statePatch) => ({...state, ...statePatch}),
        GetConfigResponse: (config) => ({...state, config}),
        GetSettingsResponse: (settings) => ({...state, settings}),
        PatchProgress: (progressPatch) => ({...state, progress: {...state.progress, ...progressPatch}}),
        PatchMainProcessNotification: (mainProcessNotification) => ({...state, mainProcessNotification}),
        default: () => state,
    });
}
