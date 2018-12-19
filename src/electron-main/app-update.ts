import logger from "electron-log";
import {autoUpdater} from "electron-updater";

export function initAutoUpdate() {
    autoUpdater.allowDowngrade = false;
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
