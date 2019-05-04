import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {configureProviderApp} from "./configure-provider-app";
import {curryFunctionMembers} from "src/shared/util";
import {registerApi} from "./api";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[index]");

try {
    bootstrap();
} catch (error) {
    console.error(error); // tslint:disable-line:no-console
    logger.error(error);
    throw error;
}

function bootstrap() {
    configureProviderApp();
    registerApi();
}
