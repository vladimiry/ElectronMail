import logger from "electron-log";
import {autoUpdater} from "electron-updater";

export function initAutoUpdate() {
    autoUpdater.logger = logger;
    autoUpdater.checkForUpdatesAndNotify();
}
