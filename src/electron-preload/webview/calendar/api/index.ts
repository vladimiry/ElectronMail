import {PROTONMAIL_IPC_WEBVIEW_CALENDAR_API, ProtonCalendarApi} from "src/shared/api/webview/calendar";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {curryFunctionMembers} from "src/shared/util";
import {getLocationHref} from "src/electron-preload/webview/lib/util";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, "[api/index]");

const endpoints: ProtonCalendarApi = {
    async ping() {

    },

    notification() {
        return null as any;
    },
};

export function registerApi() {
    PROTONMAIL_IPC_WEBVIEW_CALENDAR_API.register(
        endpoints,
        {
            logger: _logger,
        },
    );

    _logger.verbose(`api registered, url: ${getLocationHref()}`);
}
