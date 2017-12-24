import {autoUpdater} from "electron-updater";
import logger from "electron-log";

const ONE_MINUTE_MS = 60 * 1000;
export const CHECK_INTERVAL_MS = ONE_MINUTE_MS * 30;

export function initAutoUpdate() {
    autoUpdater.logger = logger;
    autoUpdater.checkForUpdatesAndNotify();

    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), CHECK_INTERVAL_MS);
}
