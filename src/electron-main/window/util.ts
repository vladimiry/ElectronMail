import _logger from "electron-log";
import {first} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/window/util]");

export const applyZoomFactor = async (
    ctx: DeepReadonly<Context>,
    webContents: import("electron").WebContents,
): Promise<boolean> => {
    const {zoomFactor, zoomFactorDisabled} = await ctx.config$.pipe(first()).toPromise();

    logger.verbose("applyZoomFactor()", JSON.stringify({zoomFactorDisabled}));

    if (zoomFactorDisabled) {
        return false;
    }

    webContents.zoomFactor = zoomFactor;

    return true;
};
