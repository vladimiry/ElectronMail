import {NavigationExtras, Params} from "@angular/router";
import {ofType, unionize} from "@vladimiry/unionize";

export const NAVIGATION_ACTIONS = unionize({
        Go: ofType<{
            path: any[];  // eslint-disable-line @typescript-eslint/no-explicit-any
            queryParams?: Params;
            extras?: NavigationExtras;
        }>(),
        Logout: ofType<{ skipKeytarProcessing?: boolean }>(),
        OpenAboutWindow: ofType(),
        OpenExternal: ofType<{ url: string }>(),
        OpenSettingsFolder: ofType(),
        Quit: ofType(),
        ToggleBrowserWindow: ofType<{ forcedState: boolean }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "navigation:",
    },
);
