import {createFeatureSelector, createSelector} from "@ngrx/store";

import {ElectronContextLocations} from "_shared/model/electron";
import {BASE_CONFIG_PROPS, Config, Settings} from "_shared/model/options";
import {OptionsActions} from "_web_app/store/actions";
import * as fromRoot from "./root";

// TODO TS2497 "lodash" TS declarations are broken
// tslint:disable:no-var-requires
const pick = require("lodash.pick");
// tslint:enable:no-var-requires

export const featureName = "options";

interface Progress {
    addingAccount?: boolean;
    changingPassword?: boolean;
    keePassReferencing?: boolean;
    reEncryptingSettings?: boolean;
    removingAccount?: boolean;
    signingIn?: boolean;
    togglingCompactLayout?: boolean;
    updatingAccount?: boolean;
    updatingBaseSettings?: boolean;
}

export interface ProgressPatch extends Partial<Progress> {}

export interface State extends fromRoot.State {
    config: Config;
    settings: Settings;
    progress: Progress;
    electronLocations?: ElectronContextLocations;
    hasSavedPassword?: boolean;
}

const initialState: State = {
    config: {} as Config,
    settings: {} as Settings,
    progress: {},
};

export function reducer(state = initialState, action: OptionsActions.All): State {
    switch (action.type) {
        case OptionsActions.InitResponse.type: {
            return {...state, ...(action as OptionsActions.InitResponse).payload};
        }
        case OptionsActions.GetConfigResponse.type: {
            return {...state, config: (action as OptionsActions.GetConfigResponse).config};
        }
        case OptionsActions.GetSettingsResponse.type: {
            return {...state, settings: (action as OptionsActions.GetSettingsResponse).settings};
        }
        case OptionsActions.PatchProgress.type: {
            return patchProgress(state, (action as OptionsActions.PatchProgress).patch);
        }
        default: {
            return state;
        }
    }
}

function patchProgress(state: State, patch: ProgressPatch) {
    return {
        ...state,
        ...{
            progress: {
                ...state.progress,
                ...patch,
            },
        },
    };
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
export const baseConfigSelector = createSelector(configSelector, (config) => pick(config, BASE_CONFIG_PROPS));
export const configCompactLayoutSelector = createSelector(configSelector, ({compactLayout}) => compactLayout);
export const configUnreadNotificationsSelector = createSelector(configSelector, ({unreadNotifications}) => unreadNotifications);

// settings
export const settingsSelector = createSelector(stateSelector, ({settings}) => settings);
export const settingsAccountsSelector = createSelector(settingsSelector, ({accounts}) => accounts);
export const settingsAccountByLoginSelector = (login: string) => createSelector(
    settingsAccountsSelector,
    (accounts) => accounts
        .filter(({login: accountLogin}) => accountLogin === login)
        .shift(),
);
export const settingsKeePassClientConfSelector = createSelector(
    settingsSelector,
    ({keePassClientConf}) => keePassClientConf,
);
export const settingsKeePassRefSelector = createSelector(settingsSelector, ({keePassRef}) => keePassRef);
