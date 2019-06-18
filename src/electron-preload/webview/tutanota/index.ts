import {filter, take} from "rxjs/operators";
import {timer} from "rxjs";

import {ONE_SECOND_MS} from "src/shared/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {configureProviderApp} from "./configure-provider-app";
import {curryFunctionMembers} from "src/shared/util";
import {registerApi} from "./api";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[index]");

bootstrap();

function bootstrap() {
    configureProviderApp();

    timer(0, ONE_SECOND_MS).pipe(
        filter(() => navigator.onLine),
        take(1),
    ).subscribe(() => {
        registerApi()
            .then(() => {
                logger.verbose(`api registered, url: ${location.href}`);
            })
            .catch(logger.error);
    });
}
