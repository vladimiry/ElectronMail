import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";
import {curryFunctionMembers, testProtonMailAppPage} from "src/shared/util";
import {documentCookiesForCustomScheme, getLocationHref} from "src/electron-preload/webview/lib/util";
import {initProviderApi} from "./provider-api";
import {registerApi} from "./api";
import {setupProtonOpenNewTabEventHandler} from "src/electron-preload/webview/lib/custom-event";
import {setupProviderIntegration} from "./provider-api/setup";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);
const protonAppPageStatus = testProtonMailAppPage({url: getLocationHref(), logger});

documentCookiesForCustomScheme.enable(logger, true);
setupProtonOpenNewTabEventHandler(logger);
setupProviderIntegration(protonAppPageStatus);

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
