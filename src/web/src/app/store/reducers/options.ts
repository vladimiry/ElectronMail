import {UnionOf} from "unionize";

import * as fromRoot from "./root";
import {Config, Settings} from "src/shared/model/options";
import {ElectronContextLocations} from "src/shared/model/electron";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";

export const featureName = "options";

export type ProgressPatch = Partial<{
    addingAccount: boolean;
    changingPassword: boolean;
    keePassReferencing: boolean;
    reEncryptingSettings: boolean;
    removingAccount: boolean;
    signingIn: boolean;
    togglingStore: boolean;
    togglingCompactLayout: boolean;
    updatingAccount: boolean;
    changingAccountOrder: boolean;
    updatingBaseSettings: boolean;
}>;

export interface State extends fromRoot.State {
    config: Config;
    settings: Settings;
    progress: ProgressPatch;
    electronLocations?: ElectronContextLocations;
    hasSavedPassword?: boolean;
    activateBrowserWindowCounter: number;
}

const initialState: State = {
    config: {} as Config,
    settings: {} as Settings,
    progress: {},
    activateBrowserWindowCounter: 0,
};

export function reducer(state = initialState, action: UnionOf<typeof OPTIONS_ACTIONS>): State {
    return OPTIONS_ACTIONS.match(action, {
        InitResponse: (statePatch) => ({...state, ...statePatch}),
        GetConfigResponse: (config) => ({...state, config}),
        GetSettingsResponse: (settings) => ({...state, settings}),
        PatchProgress: (progressPatch) => ({...state, progress: {...state.progress, ...progressPatch}}),
        ActivateBrowserWindow: () => ({...state, activateBrowserWindowCounter: (state.activateBrowserWindowCounter || 0) + 1}),
        default: () => state,
    });
}
