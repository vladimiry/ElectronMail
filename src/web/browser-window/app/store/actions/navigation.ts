import {NavigationExtras, Params} from "@angular/router";
import {ofType, unionize} from "@vladimiry/unionize";

export const NAVIGATION_ACTIONS = unionize({
        Go: ofType<{
            path: any[];  // eslint-disable-line @typescript-eslint/no-explicit-any
            queryParams?: Params;
            extras?: NavigationExtras;
        }>(),
        Logout: ofType<Record<string, unknown>>(),
        OpenAboutWindow: ofType<Record<string, unknown>>(),
        OpenExternal: ofType<{ url: string }>(),
        OpenSettingsFolder: ofType<Record<string, unknown>>(),
        Quit: ofType<Record<string, unknown>>(),
        ToggleBrowserWindow: ofType<{ forcedState: boolean }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "navigation:",
    },
);
