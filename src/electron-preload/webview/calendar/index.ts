import {curryFunctionMembers, getPlainErrorProps, testProtonCalendarAppPage} from "src/shared/util";
import {documentCookiesForCustomScheme, getLocationHref} from "src/electron-preload/webview/lib/util";
import {initProviderApi} from "./provider-api";
import {registerApi} from "./api";
import {setupProtonOpenNewTabEventHandler} from "src/electron-preload/webview/lib/custom-event";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, __filename);
const protonAppPageStatus = testProtonCalendarAppPage({url: getLocationHref(), logger});

window.addEventListener("error", (event) => {
    const {message, filename, lineno, colno, error} = event; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    if (BUILD_ENVIRONMENT === "development") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        console.log("window.error event:", {message, filename, lineno, colno, error}); // eslint-disable-line no-console
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    logger.error({message, filename, lineno, colno, error: getPlainErrorProps(error)});
    event.preventDefault();
});

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
