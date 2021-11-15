import {produce} from "immer";

import * as fromRoot from "src/web/browser-window/app/store/reducers/root";
import {Config} from "src/shared/model/options";
import {ICON_URL} from "src/web/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {InitResponse} from "src/shared/api/main-process";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {UnionOf} from "src/shared/ngrx-util";
import {initialConfig} from "src/shared/util";

export const featureName = "options";

export type ProgressPatch = Partial<{
    addingAccount: boolean;
    changingPassword: boolean;
    reEncryptingSettings: boolean;
    removingAccount: boolean;
    signingIn: boolean;
    loadingDatabase: boolean;
    togglingStore: boolean;
    updatingAccount: boolean;
    changingAccountOrder: boolean;
    updatingBaseSettings: boolean;
    togglingLocalDbMailsListViewMode: boolean;
    togglingAccountDisabling: boolean;
    resettingDbMetadata: boolean;
}>;

export interface State extends fromRoot.State, Partial<InitResponse> {
    _initialized: boolean;
    config: Config;
    settings: Parameters<typeof OPTIONS_ACTIONS.GetSettingsResponse>[0];
    progress: ProgressPatch;
    hasSavedPassword?: boolean;
    mainProcessNotification: { action: UnionOf<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS> };
    trayIconDataURL: string;
    shouldUseDarkColors?: boolean;
}

const initialState: State = {
    _initialized: false,
    config: initialConfig(),
    settings: {
        accounts: [],
    },
    progress: {},
    mainProcessNotification: { action: IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow() },
    trayIconDataURL: ICON_URL,
};

export function reducer(state = initialState, action: UnionOf<typeof OPTIONS_ACTIONS> | UnionOf<typeof NAVIGATION_ACTIONS>): State {
    if (NAVIGATION_ACTIONS.is(action)) {
        return action.type === NAVIGATION_ACTIONS.Logout.type
            ? produce(state, (draftState) => {
                draftState.settings = initialState.settings;
                // removing "electronLocations" triggers "init" api call
                delete draftState.checkUpdateAndNotify;
                delete draftState.keytarSupport;
            })
            : state;
    }

    return OPTIONS_ACTIONS.match(action, {
        InitResponse: (statePatch) => ({...state, ...statePatch, _initialized: true}),
        GetConfigResponse: (config) => ({...state, config}),
        GetSettingsResponse: ({_rev, accounts}) => ({...state, settings: {_rev, accounts}}),
        PatchProgress: (progressPatch) => ({...state, progress: {...state.progress, ...progressPatch}}),
        PatchMainProcessNotification: (mainProcessNotification) => ({...state, mainProcessNotification}),
        TrayIconDataURL: ({value: trayIconDataURL}) => ({...state, trayIconDataURL}),
        ShouldUseDarkColors: ({shouldUseDarkColors}) => ({...state, shouldUseDarkColors}),
        default: () => state,
    });
}
