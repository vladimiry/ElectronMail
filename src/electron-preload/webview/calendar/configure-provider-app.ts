import {IPC_MAIN_API} from "src/shared/api/main"; // tslint:disable-line:no-import-zones
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {curryFunctionMembers} from "src/shared/util";
import {getLocationHref} from "src/electron-preload/webview/lib/util";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/shared-web/events-handling";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, `[configure-provider-app]`);

export function configureProviderApp() {
    logger.info(`configureProviderApp()`, JSON.stringify({locationHref: getLocationHref()}));

    // logger.info("configureAngularApp()", `setup "beforeunload" event canceling handler`);
    // window.addEventListener("beforeunload", (event) => {
    //     event.preventDefault();
    //     // Chrome requires returnValue to be set
    //     event.returnValue = "";
    // });

    enableEventsProcessing();
}

function enableEventsProcessing() {
    registerDocumentKeyDownEventListener(IPC_MAIN_API.client, document, logger);
    registerDocumentClickEventListener(IPC_MAIN_API.client, document, logger);
}
