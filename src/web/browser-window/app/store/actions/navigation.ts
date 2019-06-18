import {NavigationExtras, Params} from "@angular/router";
import {ofType, unionize} from "@vladimiry/unionize";

export const NAVIGATION_ACTIONS = unionize({
        Back: ofType<{}>(),
        Forward: ofType<{}>(),
        Go: ofType<{ path: any[]; queryParams?: Params; extras?: NavigationExtras; }>(),
        Logout: ofType<{}>(),
        OpenAboutWindow: ofType<{}>(),
        OpenExternal: ofType<{ url: string }>(),
        OpenSettingsFolder: ofType<{}>(),
        Quit: ofType<{}>(),
        ToggleBrowserWindow: ofType<{ forcedState: boolean }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "navigation:",
    },
);
