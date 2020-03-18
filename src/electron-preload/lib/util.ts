import {webFrame} from "electron"; // tslint:disable-line:no-import-zones

import {IPC_MAIN_API} from "src/shared/api/main";
import {LOGGER} from "src/electron-preload/lib/electron-exposure/logger";
import {Logger} from "src/shared/model/common";
import {curryFunctionMembers} from "src/shared/util";

export function buildLoggerBundle(prefix: string): Logger {
    return curryFunctionMembers(LOGGER, prefix);
}

// TODO apply "zoomFactor" in main process only, track of https://github.com/electron/electron/issues/10572
export function applyZoomFactor(_logger: ReturnType<typeof buildLoggerBundle>): void {
    const logger = curryFunctionMembers(_logger, "applyZoomFactor()");

    logger.verbose();

    (async () => {
        const {zoomFactor} = await IPC_MAIN_API.client({options: {logger}})("readConfig")();
        const webFrameZoomFactor = webFrame.getZoomFactor();

        logger.verbose("config.zoomFactor", JSON.stringify(zoomFactor));
        logger.verbose("webFrame.getZoomFactor() (before)", JSON.stringify(webFrameZoomFactor));

        if (webFrameZoomFactor !== zoomFactor) {
            webFrame.setZoomFactor(zoomFactor);
            logger.verbose("webFrame.getZoomFactor() (after)", JSON.stringify(webFrame.getZoomFactor()));
        }
    })().catch((error) => {
        console.error(error); // eslint-disable-line no-console
        logger.error(error);
    });
}
