import {createFeatureSelector, createSelector} from "@ngrx/store";
import {UnionOf} from "unionize";

import * as fromRoot from "./root";
import {Config, Settings} from "src/shared/model/options";
import {ElectronContextLocations} from "src/shared/model/electron";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {findAccountConfigPredicate, pickBaseConfigProperties} from "src/shared/util";

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
    updatingBaseSettings: boolean;
}>;

export interface State extends fromRoot.State {
    config: Config;
    settings: Settings;
    progress: ProgressPatch;
    electronLocations?: ElectronContextLocations;
    hasSavedPassword?: boolean;
}

const initialState: State = {
    config: {} as Config,
    settings: {} as Settings,
    progress: {},
};

export function reducer(state = initialState, action: UnionOf<typeof OPTIONS_ACTIONS>): State {
    return OPTIONS_ACTIONS.match(action, {
        InitResponse: (statePatch) => ({...state, ...statePatch}),
        GetConfigResponse: (config) => ({...state, config}),
        GetSettingsResponse: (settings) => ({...state, settings}),
        PatchProgress: (progressPatch) => ({
            ...state,
            progress: {...state.progress, ...progressPatch},
        }),
        default: () => state,
    });
}

export const stateSelector = createFeatureSelector<State>(featureName);

// progress
export const progressSelector = createSelector(stateSelector, ({progress}) => progress);

// electronLocations
export const electronLocationsSelector = createSelector(stateSelector, ({electronLocations}) => electronLocations);

// hasSavedPassword
export const hasSavedPasswordSelector = createSelector(stateSelector, ({hasSavedPassword}) => hasSavedPassword);

// config
export const configSelector = createSelector(stateSelector, ({config}) => config);
export const baseConfigSelector = createSelector(configSelector, (config) => pickBaseConfigProperties(config));
export const configCompactLayoutSelector = createSelector(configSelector, ({compactLayout}) => compactLayout);
export const configUnreadNotificationsSelector = createSelector(configSelector, ({unreadNotifications}) => unreadNotifications);

// settings
export const settingsSelector = createSelector(stateSelector, ({settings}) => settings);
export const settingsAccountsSelector = createSelector(settingsSelector, ({accounts}) => accounts);
export const settingsAccountByLoginSelector = (login: string) => createSelector(
    settingsAccountsSelector,
    (accounts) => accounts.find(findAccountConfigPredicate(login)),
);
export const settingsKeePassClientConfSelector = createSelector(
    settingsSelector,
    ({keePassClientConf}) => keePassClientConf,
);
export const settingsKeePassRefSelector = createSelector(settingsSelector, ({keePassRef}) => keePassRef);
