import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/constants";
import {curryFunctionMembers, testProtonAppPage} from "src/shared/util";
import {getLocationHref} from "src/electron-preload/webview/lib/util";
import {initProviderApi} from "src/electron-preload/webview/primary/provider-api";
import {registerApi} from "./api";
import {setupProviderIntegration} from "src/electron-preload/webview/primary/provider-api/setup";

if (BUILD_ENVIRONMENT === "development") {
    window.addEventListener("error", (event) => {
        console.log("window.error event:", event); // eslint-disable-line no-console
    });
}

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[index]");
const protonAppPageStatus = testProtonAppPage({url: getLocationHref(), logger});

if (protonAppPageStatus.packagedWebClientUrl?.pathname !== `/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}`) {
    logger.info("start setting up provider integration");
    setupProviderIntegration();
} else {
    logger.info("skip setting up provider integration");
}

if (protonAppPageStatus.shouldInitProviderApi) {
    logger.info("start provider api registering");

    // TODO set up timeout
    initProviderApi()
        .then((value) => {
            registerApi(value);
        })
        .catch((error) => {
            logger.error(error);
            throw error;
        });
} else {
    logger.info("skip provider api registering");
}
