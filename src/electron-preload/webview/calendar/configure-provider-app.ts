import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {curryFunctionMembers} from "src/shared/util";
import {getLocationHref} from "src/electron-preload/webview/lib/util";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, `[configure-provider-app]`);

function enableEventsProcessing(): void {
    registerDocumentKeyDownEventListener(document, logger);
    registerDocumentClickEventListener(document, logger);
}

export function configureProviderApp(): void {
    logger.info(`configureProviderApp()`, JSON.stringify({locationHref: getLocationHref()}));

    // logger.info("configureAngularApp()", `setup "beforeunload" event canceling handler`);
    // window.addEventListener("beforeunload", (event) => {
    //     event.preventDefault();
    //     // Chrome requires returnValue to be set
    //     event.returnValue = "";
    // });

    enableEventsProcessing();
}

