import type {NavigationExtras, Params} from "@angular/router";

import {props, propsRecordToActionsRecord} from "src/shared/util/ngrx";

export const NAVIGATION_ACTIONS = propsRecordToActionsRecord(
    {
        Go: props<{
            path: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            queryParams?: Params;
            extras?: NavigationExtras;
        }>(),
        Logout: props<{skipKeytarProcessing?: boolean}>(),
        OpenAboutWindow: null,
        OpenExternal: props<{url: string}>(),
        OpenSettingsFolder: null,
        Quit: null,
        ToggleBrowserWindow: props<{forcedState: boolean}>(),
    },
    {prefix: __filename},
);
