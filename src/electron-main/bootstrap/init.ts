import electronUnhandled from "electron-unhandled";
import logger from "electron-log";
import {app} from "electron";

import {REPOSITORY_NAME} from "src/shared/constants";

// WARN needs to be called before app is ready, function is synchronous
export function bootstrapInit() {
    electronUnhandled({
        logger: logger.error,
        showDialog: true,
    });

    // needed for desktop notifications properly working on Win 10, details https://www.electron.build/configuration/nsis
    app.setAppUserModelId(`github.com/vladimiry/${REPOSITORY_NAME}`);

    if (!app.requestSingleInstanceLock()) {
        // calling app.exit() instead of app.quit() in order to prevent "Error: Cannot find module ..." error happening
        // https://github.com/electron/electron/issues/8862
        app.exit();
    }
}
