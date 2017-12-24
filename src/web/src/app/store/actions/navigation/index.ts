import {Back} from "./back";
import {Forward} from "./forward";
import {Go} from "./go";
import {Logout} from "./logout";
import {OpenAboutWindow} from "./open-about-window";
import {OpenExternal} from "./open-external";
import {OpenSettingsFolder} from "./open-settings-folder";
import {Quit} from "./quit";
import {ToggleBrowserWindow} from "./toggle-browser-window";

export {
    Back,
    Forward,
    Go,
    Logout,
    OpenAboutWindow,
    OpenExternal,
    OpenSettingsFolder,
    Quit,
    ToggleBrowserWindow,
};

export type All =
    | Back
    | Forward
    | Go
    | Logout
    | OpenAboutWindow
    | OpenExternal
    | OpenSettingsFolder
    | Quit
    | ToggleBrowserWindow;
