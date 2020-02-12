import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/constants";
import {configureProviderApp} from "./configure-provider-app";
import {curryFunctionMembers, parsePackagedWebClientUrl} from "src/shared/util";
import {getLocationHref} from "src/electron-preload/webview/lib/util";
import {registerApi} from "./api";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, `[index]`);

logger.info(JSON.stringify({locationHref: getLocationHref()}));

const packagedWebClientUrl = parsePackagedWebClientUrl(getLocationHref());
logger.verbose(JSON.stringify({packagedWebClientUrl}));

if (
    !packagedWebClientUrl
    ||
    packagedWebClientUrl.pathname === `/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}`
) {
    logger.info(`Skip webview logic as no packaged web-client page detected or the page is the "loader/blank" one`);
} else {
    logger.info(`Start registering webview logic`);

    configureProviderApp(packagedWebClientUrl);
    registerApi();
}
