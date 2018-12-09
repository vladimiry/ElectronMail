import logger from "electron-log";
import {autoUpdater} from "@vladimiry/electron-updater";

// TODO switch to a regular "electron-updater" as soon as this PR get merged https://github.com/electron-userland/electron-builder/pull/3531
export function initAutoUpdate() {
    autoUpdater.logger = logger;

    try {
        autoUpdater.checkForUpdatesAndNotify().catch(catchError);
    } catch (error) {
        catchError(error);
    }
}

function catchError(error: Error) {
    // TODO ignore "no internet connection"-like errors only, and re-throw the others
    logger.warn(error);
}
