import logger from "electron-log";
import {autoUpdater} from "electron-updater";

export function initAutoUpdate() {
    autoUpdater.channel = "beta";
    autoUpdater.allowDowngrade = false;
    autoUpdater.logger = logger;
    autoUpdater.checkForUpdatesAndNotify();
}
