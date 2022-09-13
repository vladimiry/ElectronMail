import {attachUnhandledErrorHandler, documentCookiesForCustomScheme, getLocationHref} from "src/electron-preload/webview/lib/util";
import {curryFunctionMembers} from "src/shared/util";
import {initProviderApi} from "./provider-api";
import {registerApi} from "./api";
import {setupProtonOpenNewTabEventHandler} from "src/electron-preload/webview/lib/custom-event";
import {testProtonCalendarAppPage} from "src/shared/util/proton-webclient";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, __filename);

attachUnhandledErrorHandler(logger);

const protonAppPageStatus = testProtonCalendarAppPage({url: getLocationHref(), logger});

documentCookiesForCustomScheme.enable(logger);
setupProtonOpenNewTabEventHandler(logger);

// TODO throw error if "not calendar or blank.html" page loaded
if (protonAppPageStatus.shouldInitProviderApi) {
    // TODO set up timeout
    initProviderApi()
        .then(registerApi)
        .catch((error) => {
            logger.error(error);
            throw error;
        });
}
