import {merge} from "rxjs";

import {curryFunctionMembers} from "src/shared/util";
import {getLocationHref} from "src/shared/util/web";
import {PROTON_CALENDAR_IPC_WEBVIEW_API, ProtonCalendarApi} from "src/shared/api/webview/calendar";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, __filename);

export const registerApi = (/* providerApi: ProviderApi */): void => {
    const endpoints: ProtonCalendarApi = {
        async ping({accountIndex}) {
            return {value: JSON.stringify({accountIndex})};
        },

        notification({accountIndex}) {
            const logger = curryFunctionMembers(_logger, nameof.full(endpoints.notification), accountIndex);

            logger.info();

            return merge();
        },
    };

    PROTON_CALENDAR_IPC_WEBVIEW_API.register(endpoints, {logger: _logger});

    _logger.verbose(`api registered, url: ${getLocationHref()}`);
};
