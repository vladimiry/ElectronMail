import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";
import {curryFunctionMembers, testProtonCalendarAppPage} from "src/shared/util";
import {documentCookiesForCustomScheme, getLocationHref} from "src/electron-preload/webview/lib/util";
import {initProviderApi} from "./provider-api";
import {registerApi} from "./api";
import {setupProtonOpenNewTabEventHandler} from "src/electron-preload/webview/lib/custom-event";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, __filename);
const protonAppPageStatus = testProtonCalendarAppPage({url: getLocationHref(), logger});

documentCookiesForCustomScheme.enable(logger, true);
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

if (BUILD_ENVIRONMENT === "development") {
    window.addEventListener("error", (event) => {
        console.log("window.error event:", event); // eslint-disable-line no-console
    });
}
