import {autoUpdater} from "electron-updater";
import logger from "electron-log";

export function initAutoUpdate() {
    autoUpdater.logger = logger;
    autoUpdater.checkForUpdatesAndNotify();
}
