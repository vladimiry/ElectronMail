import logger from "electron-log";
import {autoUpdater} from "@vladimiry/electron-updater";

export function initAutoUpdate() {
    const catchError = (error: Error) => {
        // TODO ignore "no internet connection" error only, and re-throw the other
        logger.error(error);
    };

    autoUpdater.logger = logger;

    try {
        autoUpdater.checkForUpdatesAndNotify().catch(catchError);
    } catch (error) {
        catchError(error);
    }
}
