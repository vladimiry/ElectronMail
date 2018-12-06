import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";
import {disableBrowserNotificationFeature, disableBrowserServiceWorkerFeature, isBuiltInWebClient} from "src/electron-preload/webview/util";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, `[configure-provider-app]`);

export function configureProviderApp() {
    logger.info(`configureProviderApp()`, JSON.stringify({location: location.href}));

    disableBrowserNotificationFeature(logger);

    if (isBuiltInWebClient()) {
        disableBrowserServiceWorkerFeature(logger);
    }
}
