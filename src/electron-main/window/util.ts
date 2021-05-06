import _logger from "electron-log";
import {first} from "rxjs/operators";
import {lastValueFrom} from "rxjs";

import {Context} from "src/electron-main/model";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, __filename);

export const applyZoomFactor = async (
    ctx: DeepReadonly<Context>,
    webContents: import("electron").WebContents,
): Promise<boolean> => {
    const config = await lastValueFrom(ctx.config$.pipe(first()));
    const {zoomFactor, zoomFactorDisabled} = config;

    logger.verbose(nameof(applyZoomFactor), JSON.stringify({zoomFactorDisabled}));

    if (zoomFactorDisabled) {
        return false;
    }

    webContents.zoomFactor = zoomFactor;

    return true;
};
